import { EMPTY_SNAPSHOT, type SystemState, type WorkcellSnapshot } from '@/client/types/workcell';

// Server-side client of the frontend bridge (rosbridge_websocket started by robot_app's
// bringup/frontend_bridge.launch.py, bound to localhost). The browser never talks to ROS: it
// gets this module's snapshot through /api/system/state and sends commands through
// /api/system/command.
//
// The frontend is only a monitor: the connection exists while somebody is watching (or for the
// duration of a command) and nothing in the stack waits for it.

const URL = process.env.ROSBRIDGE_URL || 'ws://127.0.0.1:9090';
const RETRY_MS = 3000;
const NODES_POLL_MS = 3000;
const IDLE_CLOSE_MS = 10000;
const SERVICE_TIMEOUT_MS = 8000;

type Listener = (s: WorkcellSnapshot) => void;
type Msg = Record<string, any>;

const SYSTEM_STATES = new Set(['BUSY', 'IDLE', 'STOPPED', 'TEST']);

class Rosbridge {
  private ws: WebSocket | null = null;
  private open = false;
  private snapshot: WorkcellSnapshot = structuredClone(EMPTY_SNAPSHOT);
  private listeners = new Set<Listener>();
  private pending = new Map<string, (m: Msg) => void>();
  private seq = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private nodesTimer: ReturnType<typeof setInterval> | null = null;
  private emitQueued = false;

  // topic -> [ROS type, handler, throttle ms]
  private readonly topics: Record<string, [string, (m: Msg) => void, number]> = {
    '/theia/system_state': ['std_msgs/msg/String', (m) => this.onSystemState(String(m.data)), 0],
    '/theia/config': ['aldm_interfaces/msg/TheiaConfig', (m) => {
      this.snapshot.config = { mode: m.theia_mode, nTargets: m.n_targets, nHansen: m.n_hansen };
    }, 0],
    '/theia/cycle_status': ['aldm_interfaces/msg/TheiaCycleStatus', (m) => {
      this.snapshot.cycle = {
        scene: m.current_scene, nScenes: m.n_scenes,
        target: m.current_target, nTargets: m.n_targets,
        hansen: m.current_hansen, nHansen: m.n_hansen,
      };
    }, 0],
    '/ALDM/vision/status': ['aldm_interfaces/msg/VisionStatus', (m) => {
      this.snapshot.vision = { label: m.state_label, message: m.message };
    }, 0],
    '/theia/vision_command': ['std_msgs/msg/String', (m) => { this.snapshot.visionCommand = m.data; }, 0],
    '/theia/bt_state': ['std_msgs/msg/String', (m) => { this.snapshot.btState = m.data; }, 0],
    '/theia/last_event': ['std_msgs/msg/String', (m) => { this.snapshot.lastEvent = m.data; }, 0],
    '/run_phase/_action/feedback': ['aldm_control/action/RunPhase_FeedbackMessage', (m) => {
      this.snapshot.phase = m.feedback?.substate || null;
    }, 500],
    '/srde/state': ['std_msgs/msg/String', (m) => { this.snapshot.srde.state = m.data; }, 0],
    '/srde/cycle_active': ['std_msgs/msg/Bool', (m) => { this.snapshot.srde.cycleActive = m.data; }, 0],
    '/srde/recipe': ['std_msgs/msg/String', (m) => { this.snapshot.srde.recipe = m.data; }, 0],
    '/srde/expected_targets': ['std_msgs/msg/Int32', (m) => { this.snapshot.srde.expectedTargets = m.data; }, 0],
    '/srde/read_result': ['std_msgs/msg/String', (m) => { this.snapshot.srde.lastRead = m.data; }, 0],
  };

  current(): WorkcellSnapshot {
    return this.snapshot;
  }

  // Starts watching; returns the function that stops it.
  watch(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
    this.connect();
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
      this.scheduleClose();
    };
  }

  // Calls a ROS service through the bridge, connecting just for it if nobody is watching.
  async callService(service: string, type: string, args: Msg = {}): Promise<Msg> {
    this.connect();
    this.scheduleClose();
    await this.waitOpen(2500);
    const id = `call_${++this.seq}`;
    return new Promise<Msg>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${service} did not answer`));
      }, SERVICE_TIMEOUT_MS);
      this.pending.set(id, (m) => {
        clearTimeout(timer);
        if (m.result === false) reject(new Error(typeof m.values === 'string' ? m.values : `${service} failed`));
        else resolve(m.values ?? {});
      });
      this.send({ op: 'call_service', id, service, type, args });
    });
  }

  private waitOpen(timeoutMs: number): Promise<void> {
    if (this.open) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const poll = setInterval(() => {
        if (this.open) { clearInterval(poll); resolve(); }
        else if (Date.now() - start > timeoutMs) {
          clearInterval(poll);
          reject(new Error('The workcell stack is not reachable (frontend bridge offline)'));
        }
      }, 50);
    });
  }

  private scheduleClose() {
    if (this.listeners.size > 0 || this.closeTimer) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (this.listeners.size === 0) this.disconnect();
    }, IDLE_CLOSE_MS);
  }

  private connect() {
    if (this.ws) return;
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    let ws: WebSocket;
    try {
      ws = new WebSocket(URL);
    } catch {
      this.retryLater();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.open = true;
      this.snapshot.bridge = true;
      for (const [topic, [type, , throttle]] of Object.entries(this.topics)) {
        this.send({ op: 'subscribe', topic, type, throttle_rate: throttle, queue_length: 1 });
      }
      this.pollNodes();
      this.nodesTimer = setInterval(() => this.pollNodes(), NODES_POLL_MS);
      this.emit();
    };
    ws.onmessage = (ev) => {
      let m: Msg;
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.op === 'publish') {
        const entry = this.topics[m.topic];
        if (!entry) return;
        try { entry[1](m.msg ?? {}); } catch { return; }
        this.emit();
      } else if (m.op === 'service_response' && m.id) {
        const done = this.pending.get(m.id);
        this.pending.delete(m.id);
        done?.(m);
      }
    };
    const closed = () => {
      if (this.ws !== ws) return;
      this.teardown();
      // Everything we knew came from the stack: without the bridge it is unknown again.
      this.snapshot = structuredClone(EMPTY_SNAPSHOT);
      this.emit();
      if (this.listeners.size > 0) this.retryLater();
    };
    ws.onclose = closed;
    ws.onerror = closed;
  }

  private retryLater() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.listeners.size > 0) this.connect();
    }, RETRY_MS);
  }

  private teardown() {
    if (this.nodesTimer) { clearInterval(this.nodesTimer); this.nodesTimer = null; }
    const ws = this.ws;
    this.ws = null;
    this.open = false;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch { /* already closed */ }
    }
    for (const done of this.pending.values()) done({ result: false, values: 'bridge connection lost' });
    this.pending.clear();
  }

  private disconnect() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.teardown();
    this.snapshot = structuredClone(EMPTY_SNAPSHOT);
  }

  private send(m: Msg) {
    if (this.open && this.ws) this.ws.send(JSON.stringify(m));
  }

  private onSystemState(raw: string) {
    const state = (SYSTEM_STATES.has(raw) ? raw : 'UNKNOWN') as SystemState;
    // Cycle progress and phase belong to the cycle in flight: gone once the system is back at
    // rest (waiting, stopped or in test mode).
    if (state !== 'BUSY') {
      this.snapshot.cycle = null;
      this.snapshot.phase = null;
    }
    this.snapshot.systemState = state;
  }

  private pollNodes() {
    if (!this.open) return;
    const id = `nodes_${++this.seq}`;
    const timer = setTimeout(() => {
      if (this.pending.delete(id) && this.snapshot.nodes !== null) {
        this.snapshot.nodes = null;
        this.emit();
      }
    }, NODES_POLL_MS - 200);
    this.pending.set(id, (m) => {
      clearTimeout(timer);
      const list: unknown = m.result === false ? null : m.values?.nodes;
      const nodes = Array.isArray(list) ? list.map((n) => String(n).replace(/^\/+/, '')).sort() : null;
      if (JSON.stringify(nodes) !== JSON.stringify(this.snapshot.nodes)) {
        this.snapshot.nodes = nodes;
        // The orchestrator's state is latched; if the orchestrator is gone it is stale.
        if (nodes && !nodes.includes('bt_task_manager')) {
          this.onSystemState('UNKNOWN');
          this.snapshot.btState = this.snapshot.lastEvent = this.snapshot.visionCommand = null;
        }
        this.emit();
      }
    });
    this.send({ op: 'call_service', id, service: '/rosapi/nodes', type: 'rosapi_msgs/srv/Nodes', args: {} });
  }

  // Coalesces bursts of topic updates into one notification.
  private emit() {
    if (this.emitQueued) return;
    this.emitQueued = true;
    setTimeout(() => {
      this.emitQueued = false;
      for (const l of this.listeners) l(this.snapshot);
    }, 50);
  }
}

// One instance per server process (survives Next.js dev hot reloads).
const holder = globalThis as unknown as { __workcellRosbridge?: Rosbridge };
export const rosbridge = (holder.__workcellRosbridge ??= new Rosbridge());

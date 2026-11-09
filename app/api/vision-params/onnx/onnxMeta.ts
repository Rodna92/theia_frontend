// Minimal ONNX (protobuf) reader: pulls model metadata, opsets, graph inputs/outputs and
// graph statistics out of a .onnx file without loading a runtime. Tensor data is skipped.
// Field numbers follow onnx/onnx.proto.

type Field = { num: number; wire: number; value: bigint | Uint8Array };

const decoder = new TextDecoder();

function* fields(buf: Uint8Array): Generator<Field> {
  let pos = 0;
  const varint = (): bigint => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (pos >= buf.length) throw new Error('Truncated protobuf varint');
      const b = buf[pos++];
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
      shift += 7n;
    }
  };
  while (pos < buf.length) {
    const tag = Number(varint());
    const num = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) yield { num, wire, value: varint() };
    else if (wire === 2) {
      const len = Number(varint());
      if (pos + len > buf.length) throw new Error('Truncated protobuf field');
      yield { num, wire, value: buf.subarray(pos, pos + len) };
      pos += len;
    } else if (wire === 1) {
      yield { num, wire, value: buf.subarray(pos, pos + 8) };
      pos += 8;
    } else if (wire === 5) {
      yield { num, wire, value: buf.subarray(pos, pos + 4) };
      pos += 4;
    } else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }
}

const str = (f: Field) => decoder.decode(f.value as Uint8Array);
const int = (f: Field) => Number(BigInt.asIntN(64, f.value as bigint));

// Repeated int64 fields may be packed (wire type 2) or one value per tag.
function ints(f: Field): number[] {
  if (f.wire === 0) return [int(f)];
  const out: number[] = [];
  const buf = f.value as Uint8Array;
  let pos = 0;
  while (pos < buf.length) {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const b = buf[pos++];
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7n;
    }
    out.push(Number(BigInt.asIntN(64, result)));
  }
  return out;
}

export const ELEM_TYPES: Record<number, [name: string, bytes: number]> = {
  1: ['float32', 4], 2: ['uint8', 1], 3: ['int8', 1], 4: ['uint16', 2], 5: ['int16', 2],
  6: ['int32', 4], 7: ['int64', 8], 8: ['string', 0], 9: ['bool', 1], 10: ['float16', 2],
  11: ['float64', 8], 12: ['uint32', 4], 13: ['uint64', 8], 14: ['complex64', 8],
  15: ['complex128', 16], 16: ['bfloat16', 2], 17: ['float8e4m3fn', 1], 18: ['float8e4m3fnuz', 1],
  19: ['float8e5m2', 1], 20: ['float8e5m2fnuz', 1], 21: ['uint4', 0.5], 22: ['int4', 0.5],
};
const elemName = (t: number) => ELEM_TYPES[t]?.[0] ?? (t ? `type ${t}` : 'unknown');

export interface OnnxTensorInfo {
  name: string;
  elemType: string;
  // Numbers are fixed sizes; strings are symbolic (e.g. "batch"); null is unknown.
  shape: (number | string | null)[] | null;
  docString?: string;
}

export interface OnnxMeta {
  irVersion?: number;
  producerName?: string;
  producerVersion?: string;
  domain?: string;
  modelVersion?: number;
  docString?: string;
  opsets: { domain: string; version: number }[];
  metadata: { key: string; value: string }[];
  graph: {
    name?: string;
    docString?: string;
    inputs: OnnxTensorInfo[];
    outputs: OnnxTensorInfo[];
    nodeCount: number;
    initializerCount: number;
    parameterCount: number;
    weightBytes: number;
    // Operator type -> count, sorted by count descending.
    operators: { op: string; count: number }[];
  };
  functionCount: number;
}

function parseValueInfo(buf: Uint8Array): OnnxTensorInfo {
  const info: OnnxTensorInfo = { name: '', elemType: 'unknown', shape: null };
  for (const f of fields(buf)) {
    if (f.num === 1) info.name = str(f);
    else if (f.num === 3) info.docString = str(f);
    else if (f.num === 2) {
      // TypeProto.tensor_type (1) / sparse_tensor_type (8): elem_type (1), shape (2)
      for (const tf of fields(f.value as Uint8Array)) {
        if (tf.num !== 1 && tf.num !== 8) {
          if (tf.num === 4) info.elemType = 'sequence';
          else if (tf.num === 5) info.elemType = 'map';
          else if (tf.num === 9) info.elemType = 'optional';
          continue;
        }
        for (const tt of fields(tf.value as Uint8Array)) {
          if (tt.num === 1) info.elemType = elemName(int(tt));
          else if (tt.num === 2) {
            info.shape = [];
            for (const dim of fields(tt.value as Uint8Array)) {
              if (dim.num !== 1) continue;
              let d: number | string | null = null;
              for (const df of fields(dim.value as Uint8Array)) {
                if (df.num === 1) d = int(df);
                else if (df.num === 2) d = str(df);
              }
              info.shape.push(d);
            }
          }
        }
      }
    }
  }
  return info;
}

export function parseOnnx(buf: Uint8Array): OnnxMeta {
  const meta: OnnxMeta = {
    opsets: [],
    metadata: [],
    graph: {
      inputs: [], outputs: [], nodeCount: 0, initializerCount: 0,
      parameterCount: 0, weightBytes: 0, operators: [],
    },
    functionCount: 0,
  };
  let graphBuf: Uint8Array | undefined;

  for (const f of fields(buf)) {
    switch (f.num) {
      case 1: meta.irVersion = int(f); break;
      case 2: meta.producerName = str(f); break;
      case 3: meta.producerVersion = str(f); break;
      case 4: meta.domain = str(f); break;
      case 5: meta.modelVersion = int(f); break;
      case 6: meta.docString = str(f); break;
      case 7: graphBuf = f.value as Uint8Array; break;
      case 8: {
        let domain = '';
        let version = 0;
        for (const o of fields(f.value as Uint8Array)) {
          if (o.num === 1) domain = str(o);
          else if (o.num === 2) version = int(o);
        }
        meta.opsets.push({ domain: domain || 'ai.onnx', version });
        break;
      }
      case 14: {
        let key = '';
        let value = '';
        for (const m of fields(f.value as Uint8Array)) {
          if (m.num === 1) key = str(m);
          else if (m.num === 2) value = str(m);
        }
        meta.metadata.push({ key, value });
        break;
      }
      case 25: meta.functionCount++; break;
    }
  }
  if (!graphBuf) throw new Error('Not an ONNX model (no graph found)');

  const g = meta.graph;
  const ops = new Map<string, number>();
  const initNames = new Set<string>();
  const inputs: OnnxTensorInfo[] = [];
  for (const f of fields(graphBuf)) {
    switch (f.num) {
      case 1: {
        g.nodeCount++;
        let op = '';
        let domain = '';
        for (const n of fields(f.value as Uint8Array)) {
          if (n.num === 4) op = str(n);
          else if (n.num === 7) domain = str(n);
        }
        const label = domain && domain !== 'ai.onnx' ? `${domain}::${op}` : op;
        ops.set(label, (ops.get(label) ?? 0) + 1);
        break;
      }
      case 2: g.name = str(f); break;
      case 5: {
        g.initializerCount++;
        const dims: number[] = [];
        let dataType = 0;
        for (const t of fields(f.value as Uint8Array)) {
          if (t.num === 1) dims.push(...ints(t));
          else if (t.num === 2) dataType = int(t);
          else if (t.num === 8) initNames.add(str(t));
        }
        const count = dims.reduce((a, b) => a * b, 1);
        g.parameterCount += count;
        g.weightBytes += count * (ELEM_TYPES[dataType]?.[1] ?? 0);
        break;
      }
      case 10: g.docString = str(f); break;
      case 11: inputs.push(parseValueInfo(f.value as Uint8Array)); break;
      case 12: g.outputs.push(parseValueInfo(f.value as Uint8Array)); break;
    }
  }
  // Older IR versions also list every initializer as a graph input; keep only real inputs.
  g.inputs = inputs.filter((i) => !initNames.has(i.name));
  g.operators = [...ops].map(([op, count]) => ({ op, count })).sort((a, b) => b.count - a.count);
  return meta;
}

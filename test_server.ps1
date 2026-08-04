Start-Sleep -Seconds 2
try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/en/process'
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host "Status Description: $($response.StatusDescription)"
    Write-Host "Content length: $($response.Content.Length)"
} catch {
    Write-Host "Exception: $($_.Exception.Message)"
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
}

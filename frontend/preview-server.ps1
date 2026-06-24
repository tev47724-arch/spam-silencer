param(
  [int]$Port = 5508
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()

    while ($reader.ReadLine()) {}

    $path = "/"
    if ($requestLine -match "^[A-Z]+\s+([^\s]+)") {
      $path = [Uri]::UnescapeDataString($Matches[1].Split("?")[0])
    }

    if ($path -eq "/") {
      $path = "/index.html"
    }

    $relative = $path.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
    $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relative))
    $rootPath = [System.IO.Path]::GetFullPath($Root)

    if (-not $fullPath.StartsWith($rootPath) -or -not [System.IO.File]::Exists($fullPath)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $header = "HTTP/1.1 404 Not Found`r`nContent-Length: $($body.Length)`r`nContent-Type: text/plain`r`nConnection: close`r`n`r`n"
    } else {
      $body = [System.IO.File]::ReadAllBytes($fullPath)
      $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $header = "HTTP/1.1 200 OK`r`nContent-Length: $($body.Length)`r`nContent-Type: $contentType`r`nConnection: close`r`n`r`n"
    }

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($body, 0, $body.Length)
  } finally {
    $client.Close()
  }
}

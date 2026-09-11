$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$voteFile = Join-Path $root 'data\votes.json'
$privateMapboxConfig = Join-Path $root 'js\mapbox_config.private.js'
$listener = $null
$port = 8000

function Send-Bytes($stream, [int]$status, [string]$reason, [string]$contentType, [byte[]]$body, [string]$cacheControl = 'no-store') {
    $header = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: $cacheControl`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    $head = [Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($head, 0, $head.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
}

function Send-Json($stream, [int]$status, [string]$reason, $payload) {
    $json = $payload | ConvertTo-Json -Depth 8 -Compress
    Send-Bytes $stream $status $reason 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json))
}

function New-VoteStore {
    return [PSCustomObject]@{ version = 2; storage = 'anonymous_aggregate_only'; clusters = @() }
}

function Read-VoteStore {
    if (-not [IO.File]::Exists($voteFile)) { return New-VoteStore }
    $store = Get-Content -LiteralPath $voteFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$store.version -ne 2 -or [string]$store.storage -ne 'anonymous_aggregate_only' -or $null -eq $store.clusters) {
        throw 'Vote storage is not in anonymous aggregate format. Run scripts\migrate_votes_to_anonymous_totals.ps1 first.'
    }
    return $store
}

function Save-VoteStore($store) {
    $json = $store | ConvertTo-Json -Depth 8
    $temporary = "$voteFile.tmp"
    [IO.File]::WriteAllText($temporary, $json, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $voteFile -Force
}

function Parse-Query([string]$target) {
    $result = @{}
    $parts = $target -split '\?', 2
    if ($parts.Count -lt 2) { return $result }
    foreach ($pair in ($parts[1] -split '&')) {
        if ([string]::IsNullOrWhiteSpace($pair)) { continue }
        $entry = $pair -split '=', 2
        $key = [Uri]::UnescapeDataString($entry[0].Replace('+', ' '))
        $value = if ($entry.Count -gt 1) { [Uri]::UnescapeDataString($entry[1].Replace('+', ' ')) } else { '' }
        $result[$key] = $value
    }
    return $result
}

function Empty-Totals {
    return [PSCustomObject]@{
        familiarity = [PSCustomObject]@{ unfamiliar = 0; somewhat_familiar = 0; very_familiar = 0 }
        agreement = [PSCustomObject]@{ disagree = 0; somewhat_agree = 0; strongly_agree = 0 }
        total_votes = 0
    }
}

function Get-ClusterRecord($store, [int]$scale, [string]$communityId) {
    return @($store.clusters | Where-Object { [int]$_.scale -eq $scale -and [string]$_.community_id -eq $communityId }) | Select-Object -First 1
}

function Get-VoteTotals($record) {
    if ($null -eq $record) { return Empty-Totals }
    return [PSCustomObject]@{
        familiarity = [PSCustomObject]@{
            unfamiliar = [int]$record.familiarity.unfamiliar
            somewhat_familiar = [int]$record.familiarity.somewhat_familiar
            very_familiar = [int]$record.familiarity.very_familiar
        }
        agreement = [PSCustomObject]@{
            disagree = [int]$record.boundary_match.no_match
            somewhat_agree = [int]$record.boundary_match.moderate_match
            strongly_agree = [int]$record.boundary_match.strong_match
        }
        total_votes = [int]$record.total_votes
    }
}

function Csv-Cell($value) { return '"' + ([string]$value).Replace('"', '""') + '"' }

function Get-VoteCsv($store) {
    $rows = [Collections.Generic.List[string]]::new()
    $rows.Add('"scale","cluster_id","cluster_size","familiarity_unfamiliar","familiarity_moderately_familiar","familiarity_very_familiar","boundary_no_match","boundary_moderate_match","boundary_strong_match","total_votes","last_updated"')
    foreach ($record in @($store.clusters | Sort-Object scale, community_id)) {
        $values = @($record.scale, $record.community_id, $record.community_size, $record.familiarity.unfamiliar, $record.familiarity.somewhat_familiar, $record.familiarity.very_familiar, $record.boundary_match.no_match, $record.boundary_match.moderate_match, $record.boundary_match.strong_match, $record.total_votes, $record.last_updated)
        $rows.Add(($values | ForEach-Object { Csv-Cell $_ }) -join ',')
    }
    return $rows -join "`r`n"
}

function Adjust-Count($target, [string]$property, [int]$delta) {
    $target.$property = [Math]::Max(0, [int]$target.$property + $delta)
}

foreach ($candidate in 8000..8010) {
    try {
        $test = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidate)
        $test.Start(); $listener = $test; $port = $candidate; break
    } catch { if ($test) { $test.Stop() } }
}
if (-not $listener) { throw 'No available local port was found between 8000 and 8010.' }

$mime = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json; charset=utf-8';'.geojson'='application/geo+json; charset=utf-8';'.pbf'='application/x-protobuf';'.csv'='text/csv; charset=utf-8';'.png'='image/png';'.svg'='image/svg+xml';'.ico'='image/x-icon';'.md'='text/plain; charset=utf-8'}
$url = "http://127.0.0.1:$port/"
Write-Host ''; Write-Host 'Shanghai Urban Form Web Map' -ForegroundColor Cyan
Write-Host "Serving: $root"; Write-Host "Open:    $url"
Write-Host "Votes:   $voteFile (anonymous aggregate totals only)"
Write-Host 'Keep this window open while viewing the map.'
Write-Host 'Press Ctrl+C to stop the server.'; Write-Host ''
if ($env:WEBMAP_NO_BROWSER -ne '1') { Start-Process $url }

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
            $request = $reader.ReadLine()
            if (-not $request -or $request -notmatch '^(GET|POST)\s+([^\s]+)\s+HTTP/') { Send-Json $stream 400 'Bad Request' @{ error = 'Invalid request.' }; continue }
            $method = $Matches[1]; $target = $Matches[2]
            $headers = @{}
            while (($line = $reader.ReadLine()) -ne '') {
                if ($null -eq $line) { break }
                $parts = $line -split ':', 2
                if ($parts.Count -eq 2) { $headers[$parts[0].Trim().ToLowerInvariant()] = $parts[1].Trim() }
            }
            $requestPath = [Uri]::UnescapeDataString(($target -split '\?', 2)[0])

            if ($method -eq 'POST' -and $requestPath -eq '/api/votes') {
                $length = if ($headers.ContainsKey('content-length')) { [int]$headers['content-length'] } else { 0 }
                if ($length -le 0 -or $length -gt 8192) { Send-Json $stream 400 'Bad Request' @{ error = 'Invalid request body.' }; continue }
                $buffer = New-Object char[] $length; $read = 0
                while ($read -lt $length) { $count = $reader.ReadBlock($buffer, $read, $length - $read); if ($count -le 0) { break }; $read += $count }
                try { $vote = (-join $buffer[0..($read - 1)]) | ConvertFrom-Json } catch { Send-Json $stream 400 'Bad Request' @{ error = 'Invalid JSON.' }; continue }
                $scale = [int]$vote.scale; $communityId = [string]$vote.community_id; $communitySize = [int]$vote.community_size
                $validFamiliarity = @('unfamiliar','somewhat_familiar','very_familiar')
                $validAgreement = @('disagree','somewhat_agree','strongly_agree')
                $valid = $scale -ge 1 -and $scale -le 5 -and $communityId -match "^S$scale-C\d{4}$" -and $communitySize -ge 1 -and $communitySize -le 5956 -and $validFamiliarity -contains [string]$vote.familiarity -and $validAgreement -contains [string]$vote.agreement
                if (-not $valid) { Send-Json $stream 422 'Unprocessable Entity' @{ error = 'Vote values are invalid.' }; continue }

                $store = Read-VoteStore
                $record = Get-ClusterRecord $store $scale $communityId
                if ($null -eq $record) {
                    $record = [PSCustomObject]@{
                        scale=$scale; community_id=$communityId; community_size=$communitySize
                        familiarity=[PSCustomObject]@{ unfamiliar=0; somewhat_familiar=0; very_familiar=0 }
                        boundary_match=[PSCustomObject]@{ no_match=0; moderate_match=0; strong_match=0 }
                        total_votes=0; last_updated=''
                    }
                    $store.clusters = @($store.clusters) + $record
                }

                $previous = $vote.previous_vote
                $hasPrevious = $null -ne $previous -and $validFamiliarity -contains [string]$previous.familiarity -and $validAgreement -contains [string]$previous.agreement
                $familiarityProperties = @{ unfamiliar='unfamiliar'; somewhat_familiar='somewhat_familiar'; very_familiar='very_familiar' }
                $agreementProperties = @{ disagree='no_match'; somewhat_agree='moderate_match'; strongly_agree='strong_match' }
                if ($hasPrevious) {
                    Adjust-Count $record.familiarity $familiarityProperties[[string]$previous.familiarity] -1
                    Adjust-Count $record.boundary_match $agreementProperties[[string]$previous.agreement] -1
                } else { $record.total_votes = [int]$record.total_votes + 1 }
                Adjust-Count $record.familiarity $familiarityProperties[[string]$vote.familiarity] 1
                Adjust-Count $record.boundary_match $agreementProperties[[string]$vote.agreement] 1
                $record.community_size = $communitySize
                $record.last_updated = [DateTime]::UtcNow.ToString('o')
                Save-VoteStore $store
                Send-Json $stream 200 'OK' @{ ok=$true; totals=(Get-VoteTotals $record) }
                continue
            }

            if ($method -eq 'GET' -and $requestPath -eq '/api/votes/stats') {
                $query = Parse-Query $target; $scale = [int]$query['scale']; $communityId = [string]$query['community_id']
                if ($scale -lt 1 -or $scale -gt 5 -or $communityId -notmatch "^S$scale-C\d{4}$") { Send-Json $stream 400 'Bad Request' @{ error='Invalid cluster.' }; continue }
                $store = Read-VoteStore
                Send-Json $stream 200 'OK' @{ totals=(Get-VoteTotals (Get-ClusterRecord $store $scale $communityId)) }
                continue
            }

            if ($method -eq 'GET' -and $requestPath -eq '/api/votes/export.csv') {
                $csv = Get-VoteCsv (Read-VoteStore)
                $body = [byte[]]([Text.Encoding]::UTF8.GetPreamble() + [Text.Encoding]::UTF8.GetBytes($csv))
                Send-Bytes $stream 200 'OK' 'text/csv; charset=utf-8' $body
                continue
            }

            if ($method -eq 'GET' -and $requestPath -eq '/js/mapbox_config.js' -and [IO.File]::Exists($privateMapboxConfig)) {
                $body = [IO.File]::ReadAllBytes($privateMapboxConfig)
                Send-Bytes $stream 200 'OK' 'text/javascript; charset=utf-8' $body 'no-store'
                continue
            }

            if ($requestPath.StartsWith('/api/')) { Send-Json $stream 404 'Not Found' @{ error='API route not found.' }; continue }
            if ($method -ne 'GET') { Send-Json $stream 405 'Method Not Allowed' @{ error='Method not allowed.' }; continue }

            $relative = $requestPath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative='index.html' }
            $relative = $relative.Replace('/', [IO.Path]::DirectorySeparatorChar)
            $file = [IO.Path]::GetFullPath((Join-Path $root $relative))
            $inside = $file.Equals($root,[StringComparison]::OrdinalIgnoreCase) -or $file.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)
            if (-not $inside -or -not [IO.File]::Exists($file)) {
                Send-Bytes $stream 404 'Not Found' 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes('404 Not Found'))
            } else {
                $body = [IO.File]::ReadAllBytes($file); $extension = [IO.Path]::GetExtension($file).ToLowerInvariant(); $type = if($mime.ContainsKey($extension)){$mime[$extension]}else{'application/octet-stream'}
                $cache = if ($extension -in @('.html','.js','.css')) { 'no-cache' } else { 'public, max-age=3600' }
                Send-Bytes $stream 200 'OK' $type $body $cache
            }
        } catch {
            try { Send-Json $stream 500 'Internal Server Error' @{ error='The local server could not complete the request.' } } catch {}
            Write-Warning $_.Exception.Message
        } finally { $client.Close() }
    }
} finally { $listener.Stop() }

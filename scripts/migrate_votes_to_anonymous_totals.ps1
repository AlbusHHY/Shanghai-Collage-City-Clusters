$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publicVoteFile = [IO.Path]::GetFullPath((Join-Path $projectRoot 'data\votes.json'))
$privateVoteFile = [IO.Path]::GetFullPath((Join-Path $projectRoot 'data\votes.private.json'))
$seedJsonFile = [IO.Path]::GetFullPath((Join-Path $projectRoot 'data\vote_totals_seed.json'))
$seedSqlFile = [IO.Path]::GetFullPath((Join-Path $projectRoot 'worker\seed.sql'))

foreach ($path in @($publicVoteFile, $privateVoteFile, $seedJsonFile, $seedSqlFile)) {
    if (-not $path.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe path outside project: $path"
    }
}

if (-not [IO.File]::Exists($privateVoteFile)) {
    if (-not [IO.File]::Exists($publicVoteFile)) { throw 'The source vote file is missing.' }
    Copy-Item -LiteralPath $publicVoteFile -Destination $privateVoteFile -ErrorAction Stop
}

$source = Get-Content -LiteralPath $privateVoteFile -Raw -Encoding UTF8 | ConvertFrom-Json
$rawVotes = @($source.votes)
if ($rawVotes.Count -eq 0) { throw 'The private source contains no votes to migrate.' }

$clusters = foreach ($group in @($rawVotes | Group-Object { "$($_.scale)|$($_.community_id)" })) {
    $items = @($group.Group)
    [PSCustomObject]@{
        scale = [int]$items[0].scale
        community_id = [string]$items[0].community_id
        community_size = [int]$items[0].community_size
        familiarity = [PSCustomObject]@{
            unfamiliar = @($items | Where-Object familiarity -eq 'unfamiliar').Count
            somewhat_familiar = @($items | Where-Object familiarity -eq 'somewhat_familiar').Count
            very_familiar = @($items | Where-Object familiarity -eq 'very_familiar').Count
        }
        boundary_match = [PSCustomObject]@{
            no_match = @($items | Where-Object agreement -eq 'disagree').Count
            moderate_match = @($items | Where-Object agreement -eq 'somewhat_agree').Count
            strong_match = @($items | Where-Object agreement -eq 'strongly_agree').Count
        }
        total_votes = $items.Count
        last_updated = [string](@($items | Sort-Object updated_at -Descending)[0].updated_at)
    }
}

$store = [PSCustomObject]@{ version = 2; storage = 'anonymous_aggregate_only'; clusters = @($clusters | Sort-Object scale, community_id) }
$json = $store | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($publicVoteFile, $json, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($seedJsonFile, $json, [Text.UTF8Encoding]::new($false))

function Sql-Text([string]$value) { return "'" + $value.Replace("'", "''") + "'" }
$sql = [Collections.Generic.List[string]]::new()
$sql.Add('-- Anonymous aggregate seed generated from the local private vote backup.')
$sql.Add('-- No visitor IDs, IP addresses, user agents, or individual ballots are included.')
$sql.Add('BEGIN TRANSACTION;')
foreach ($row in $store.clusters) {
    $values = @(
        $row.scale,
        (Sql-Text $row.community_id),
        $row.community_size,
        $row.familiarity.unfamiliar,
        $row.familiarity.somewhat_familiar,
        $row.familiarity.very_familiar,
        $row.boundary_match.no_match,
        $row.boundary_match.moderate_match,
        $row.boundary_match.strong_match,
        $row.total_votes,
        (Sql-Text $row.last_updated)
    ) -join ', '
    $sql.Add("INSERT OR REPLACE INTO cluster_vote_totals (scale, community_id, community_size, familiarity_unfamiliar, familiarity_moderate, familiarity_very, boundary_no_match, boundary_moderate_match, boundary_strong_match, total_votes, updated_at) VALUES ($values);")
}
$sql.Add('COMMIT;')
[IO.File]::WriteAllLines($seedSqlFile, $sql, [Text.UTF8Encoding]::new($false))

[PSCustomObject]@{
    migrated_votes = $rawVotes.Count
    cluster_totals = $store.clusters.Count
    public_file = $publicVoteFile
    private_backup_ignored_by_git = $privateVoteFile
    seed_json = $seedJsonFile
    seed_sql = $seedSqlFile
} | ConvertTo-Json -Compress


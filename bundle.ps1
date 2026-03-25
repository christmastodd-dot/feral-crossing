$order = @('src/config.js','src/background.js','src/particles.js','src/truck.js','src/lanes.js','src/cat.js','src/audio.js','src/hud.js','src/highscores.js','src/game.js')
$out = @()
foreach ($f in $order) {
  $inImport = $false
  foreach ($line in (Get-Content $f)) {
    if ($line -match '^\s*import\s') { $inImport = $true }
    if ($inImport) {
      if ($line -match "from\s+[`"']") { $inImport = $false }
      continue
    }
    $line = $line -replace '^export (default )?(class|function|const|let|var) ', '$2 '
    $line = $line -replace '^export \{[^}]*\};?\s*$', ''
    $out += $line
  }
}
$out += 'const game = new Game(document.getElementById("game")); game.run();'
$out | Set-Content main.js -Encoding UTF8
Write-Host "Done. Lines: $($out.Count)"

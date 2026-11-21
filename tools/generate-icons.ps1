# Generates the PNG app icons (Windows PowerShell, uses System.Drawing).
# Usage:  powershell -ExecutionPolicy Bypass -File tools\generate-icons.ps1

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Get-Color([string]$hex) { return [System.Drawing.ColorTranslator]::FromHtml($hex) }

function New-Icon([int]$size, [string]$file, [bool]$maskable) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $bg = New-Object System.Drawing.SolidBrush (Get-Color '#16181f')
    if ($maskable) {
        $g.FillRectangle($bg, 0, 0, $size, $size)
        $inset = $size * 0.2
    } else {
        $path = New-RoundedPath 0 0 $size $size ($size * 0.22)
        $g.FillPath($bg, $path)
        $inset = $size * 0.14
    }

    $inner = $size - 2 * $inset
    $gap = $inner * 0.076
    $t = ($inner - $gap) / 2
    $tiles = @(
        @{ x = 0; y = 0; bg = '#ff70a6'; fg = '#ffffff'; text = '2' },
        @{ x = 1; y = 0; bg = '#ff9f1c'; fg = '#ffffff'; text = '4' },
        @{ x = 0; y = 1; bg = '#ffd23f'; fg = '#3a2a00'; text = '8' },
        @{ x = 1; y = 1; bg = '#3ddc84'; fg = '#05301a'; text = '16' }
    )
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    foreach ($tile in $tiles) {
        $tx = $inset + $tile.x * ($t + $gap)
        $ty = $inset + $tile.y * ($t + $gap)
        $tp = New-RoundedPath $tx $ty $t $t ($t * 0.235)
        $g.FillPath((New-Object System.Drawing.SolidBrush (Get-Color $tile.bg)), $tp)
        $fontSize = if ($tile.text.Length -gt 1) { $t * 0.42 } else { $t * 0.54 }
        $font = New-Object System.Drawing.Font('Segoe UI Black', [float]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $rect = New-Object System.Drawing.RectangleF([float]$tx, [float]($ty + $t * 0.02), [float]$t, [float]$t)
        $g.DrawString($tile.text, $font, (New-Object System.Drawing.SolidBrush (Get-Color $tile.fg)), $rect, $fmt)
    }

    $g.Dispose()
    $bmp.Save((Join-Path $outDir $file), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "wrote $file"
}

New-Icon 192 'icon-192.png' $false
New-Icon 512 'icon-512.png' $false
New-Icon 512 'icon-maskable-512.png' $true
New-Icon 180 'apple-touch-icon.png' $true

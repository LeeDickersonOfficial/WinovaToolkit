Add-Type -AssemblyName System.Drawing

$size = 512
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$rect = [System.Drawing.RectangleF]::new(18, 18, 476, 476)
$radius = 112
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$diameter = $radius * 2
$path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
$path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
$path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $rect,
  [System.Drawing.Color]::FromArgb(181, 115, 255),
  [System.Drawing.Color]::FromArgb(91, 54, 214),
  45
)
$graphics.FillPath($gradient, $path)

$glowPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(90, 221, 199, 255), 8)
$graphics.DrawPath($glowPen, $path)

$font = [System.Drawing.Font]::new('Segoe UI', 250, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = [System.Drawing.RectangleF]::new(0, -10, $size, $size)
$graphics.DrawString('W', $font, [System.Drawing.Brushes]::White, $textRect, $format)

$output = Join-Path $PSScriptRoot '..\build\icon.png'
$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

$pngBytes = [System.IO.File]::ReadAllBytes($output)
$icoOutput = Join-Path $PSScriptRoot '..\build\icon.ico'
$stream = [System.IO.File]::Create($icoOutput)
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length)
$writer.Write([uint32]22)
$writer.Write($pngBytes)
$writer.Dispose()
$stream.Dispose()

$format.Dispose()
$font.Dispose()
$glowPen.Dispose()
$gradient.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $output
Write-Output $icoOutput

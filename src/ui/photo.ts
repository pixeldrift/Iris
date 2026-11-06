/**
 * A portrait for a contact: the chosen picture is cropped to a square from its centre and shrunk to 256px as a JPEG, so it
 * is small enough (about 15–30 KB) to travel with the contact when it syncs.
 */
const SIZE = 256

export async function portraitFrom(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t prepare pictures.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close?.()
  return canvas.toDataURL('image/jpeg', 0.82)
}

/**
 * A picture for a notion: shrunk to fit 480px and saved as a JPEG, made lighter until it is under about 45 KB, so it can travel with the
 * item when it syncs (an item may be at most 64 KB in all).
 */
export async function notionImageFrom(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  let max = 480
  for (;;) {
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * k))
    canvas.height = Math.max(1, Math.round(bitmap.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser can’t prepare pictures.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const q of [0.78, 0.62, 0.48, 0.36]) {
      const url = canvas.toDataURL('image/jpeg', q)
      if (url.length <= 45_000) {
        bitmap.close?.()
        return url
      }
    }
    max = Math.round(max * 0.75)
    if (max < 120) {
      bitmap.close?.()
      return canvas.toDataURL('image/jpeg', 0.3)
    }
  }
}

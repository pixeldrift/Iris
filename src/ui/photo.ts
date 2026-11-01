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

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

/** The preview kept inside an item (small, so syncing is light): up to `limit` characters as a JPEG data URL. */
export async function notionImageFrom(file: File, limit = 18_000): Promise<string> {
  return (await pictureFrom(file, limit)).thumb
}

/**
 * A picture for an item, in two sizes: a preview (about 360px, under `limit` characters) that travels inside the item, and a sharp
 * version (up to 1600px on the long side, a good-quality JPEG) that is kept apart and opened full screen.
 */
export async function pictureFrom(file: File, limit = 18_000): Promise<{ thumb: string; blob: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const draw = (max: number) => {
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * k))
    canvas.height = Math.max(1, Math.round(bitmap.height * k))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser can’t prepare pictures.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  }
  try {
    let thumb = ''
    for (let max = 360; !thumb; max = Math.round(max * 0.8)) {
      const canvas = draw(max)
      for (const q of [0.8, 0.68, 0.56, 0.44]) {
        const url = canvas.toDataURL('image/jpeg', q)
        if (url.length <= limit) {
          thumb = url
          break
        }
      }
      if (!thumb && max < 90) thumb = canvas.toDataURL('image/jpeg', 0.3)
    }
    const big = draw(1600)
    let blob: Blob | null = null
    for (const q of [0.88, 0.8, 0.7, 0.6]) {
      blob = await new Promise<Blob | null>((resolve) => big.toBlob(resolve, 'image/jpeg', q))
      if (blob && blob.size <= 1_500_000) break
    }
    if (!blob) throw new Error('This browser can’t prepare pictures.')
    return { thumb, blob }
  } finally {
    bitmap.close?.()
  }
}

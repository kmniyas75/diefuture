import os
from PIL import Image, ImageOps

logo_path = 'public/assets/diefuture-logo.jpg'
im = Image.open(logo_path)
print("Source size:", im.size)

# The emblem is located at top-center.
# Let's crop a square around the DF monogram:
# Monogram top: ~110, bottom: ~565, center: (512, 337)
center_x = 512
center_y = 345
box_size = 520

left = center_x - box_size // 2
top = center_y - box_size // 2
right = left + box_size
bottom = top + box_size

emblem = im.crop((left, top, right, bottom))
print("Cropped emblem size:", emblem.size)

# Save icons in public/
os.makedirs('public', exist_ok=True)

emblem.resize((512, 512), Image.Resampling.LANCZOS).save('public/android-chrome-512x512.png')
emblem.resize((192, 192), Image.Resampling.LANCZOS).save('public/android-chrome-192x192.png')
emblem.resize((180, 180), Image.Resampling.LANCZOS).save('public/apple-touch-icon.png')
emblem.resize((32, 32), Image.Resampling.LANCZOS).save('public/favicon-32x32.png')
emblem.resize((16, 16), Image.Resampling.LANCZOS).save('public/favicon-16x16.png')

# Save ICO
emblem.resize((32, 32), Image.Resampling.LANCZOS).save('public/favicon.ico', format='ICO')

# Generate OG Image (1200x630) for social sharing on WhatsApp, Telegram, LinkedIn, Twitter
og_bg = Image.new('RGB', (1200, 630), color=(10, 12, 16))
# Fit logo nicely inside
logo_fitted = im.resize((600, 600), Image.Resampling.LANCZOS)
# Paste centered
og_bg.paste(logo_fitted, ((1200 - 600) // 2, (630 - 600) // 2))
og_bg.save('public/og-image.jpg', quality=92)

print("Icons generated successfully!")

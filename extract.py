import re
import json
import html

with open('/home/claude/okanagan.html', 'r', encoding='utf-8') as f:
    content = f.read()

cards = re.findall(r'<article class="venue-card".*?</article>', content, re.DOTALL)

def unescape(s):
    return html.unescape(s) if s else s

def get_attr(card, attr):
    m = re.search(attr + r'="([^"]*)"', card)
    return unescape(m.group(1)) if m else ''

def bool_attr(card, attr):
    return get_attr(card, attr) == '1'

venues = []
for card in cards:
    name = get_attr(card, 'data-name')
    region = get_attr(card, 'data-region')
    vtype = get_attr(card, 'data-type')
    cuisine = get_attr(card, 'data-cuisine')
    phone = get_attr(card, 'data-phone')
    price_raw = get_attr(card, 'data-price')
    reviews_raw = get_attr(card, 'data-reviews')

    rating_m = re.search(r'&#9733;\s*([\d.]+)', card)
    rating = float(rating_m.group(1)) if rating_m else None

    desc_m = re.search(r'<p class="venue-desc">(.*?)</p>', card, re.DOTALL)
    desc = unescape(re.sub(r'<[^>]+>', '', desc_m.group(1)).strip()) if desc_m else ''

    venues.append({
        'name': name,
        'region': region,
        'type': vtype,
        'cuisine': cuisine or None,
        'phone': phone or None,
        'price': int(price_raw) if price_raw.isdigit() else None,
        'reviews': int(reviews_raw) if reviews_raw.isdigit() else None,
        'rating': rating,
        'description': desc,
        'dog_friendly': bool_attr(card, 'data-dog'),
        'vegan': bool_attr(card, 'data-vegan'),
        'vegetarian': bool_attr(card, 'data-vegetarian'),
        'patio': bool_attr(card, 'data-patio'),
        'kid_friendly': bool_attr(card, 'data-kids'),
        'gluten_free': bool_attr(card, 'data-gluten'),
        'lake_view': bool_attr(card, 'data-view'),
        'nonalcoholic': bool_attr(card, 'data-nonalc'),
        'sports_tv': bool_attr(card, 'data-sports'),
        'live_music': bool_attr(card, 'data-music'),
    })

with open('/home/claude/okanagan-backend/venues.json', 'w', encoding='utf-8') as f:
    json.dump(venues, f, indent=2, ensure_ascii=False)

print(f"Extracted {len(venues)} venues")
print("Sample:", json.dumps(venues[0], indent=2))

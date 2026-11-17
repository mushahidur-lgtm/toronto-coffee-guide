# Data quality report

Generated 2026-11-17 by `npx tsx scripts/data-quality.ts --live`. Every count comes from `data/cafes.seed.json`, the same list the site reads.

## Totals

| | Count |
| --- | ---: |
| Records in the data file | 150 |
| Published (shown on the site) | 140 |
| Hidden as permanently closed | 10 |
| Downtown | 56 |
| West End | 22 |
| East End | 14 |
| Midtown | 8 |
| North York | 19 |
| Scarborough | 17 |
| Etobicoke | 4 |

## Coverage

| Check | Cafes affected (of 140) |
| --- | ---: |
| No description | 0 |
| Short description (under 40 characters) | 1 |
| No menu highlights | 2 |
| Food but no drinks listed | 4 |
| No Google place ID | 3 |
| No photo source at all | 3 |
| No photo on Google | 0 |
| No opening hours | 1 |
| No coordinates | 0 |
| Google status not OPERATIONAL | 0 |
| **Have a genuine photo** (editorial or Google) | **137** |
| **Have a website** (editorial or Google) | **128** |
| Invalid website or Instagram URL | 0 |
| Neighbourhood not in the neighbourhood list | 0 |
| No verified amenities (Wi-Fi, patio, laptop) | 137 |

Photos, hours and exact coordinates come live from Google Maps for cafes with a place ID; they are never stored. Amenities are only shown when a source states them, so "unverified" is expected for most cafes.

## Duplicates

None found (place ID, name or address).

## Hidden as closed

- Tandem Coffee (Corktown): Google: permanently closed
- Odin Cafe + Bar (Corktown): Google: permanently closed
- Saving Grace (Trinity Bellwoods): Google: permanently closed
- Fluffy Fluffy Dessert Cafe (Midtown): Google: permanently closed
- Cactus Vietnamese Tea and Coffee (Koreatown): Google: permanently closed
- The Oats Kafé (Church-Wellesley): marked closed in the data
- Playground Cafe (Cabbagetown): Google: permanently closed
- LÀ LÁ Bakeshop (The Annex): Google: permanently closed
- Banh Haus (Chinatown): Google: permanently closed
- Crema Coffee Co. — Junction (The Junction): Google: permanently closed

## Cafes by neighbourhood

| Neighbourhood | Region | Cafes |
| --- | --- | ---: |
| Kensington Market | Downtown | 11 |
| Willowdale | North York | 11 |
| Yorkville | Downtown | 9 |
| Chinatown | Downtown | 7 |
| Milliken | Scarborough | 7 |
| Leslieville | East End | 6 |
| Little Italy | West End | 6 |
| Koreatown | West End | 5 |
| Danforth | East End | 4 |
| Distillery District | Downtown | 4 |
| Etobicoke | Etobicoke | 4 |
| Financial District | Downtown | 4 |
| Queen West | Downtown | 4 |
| The Annex | Midtown | 4 |
| Church-Wellesley | Downtown | 3 |
| Don Mills | North York | 3 |
| Harbord Village | Downtown | 3 |
| King West | Downtown | 3 |
| Midtown | Midtown | 3 |
| Agincourt | Scarborough | 2 |
| Bay & College | Downtown | 2 |
| Dorset Park | Scarborough | 2 |
| Downsview | North York | 2 |
| Downtown Yonge | Downtown | 2 |
| Fairview | North York | 2 |
| Golden Mile | Scarborough | 2 |
| Liberty Village | West End | 2 |
| Little Portugal | West End | 2 |
| Ossington | West End | 2 |
| Riverside | East End | 2 |
| Roncesvalles | West End | 2 |
| Rouge | Scarborough | 2 |
| St. Lawrence | Downtown | 2 |
| Trinity Bellwoods | West End | 2 |
| Brockton Village | West End | 1 |
| Cabbagetown | East End | 1 |
| Dupont | Midtown | 1 |
| Entertainment District | Downtown | 1 |
| St. James Town | Downtown | 1 |
| The Beaches | East End | 1 |
| West Hill | Scarborough | 1 |
| Wexford | Scarborough | 1 |
| York Mills | North York | 1 |

## Listings needing work (11)

Amenities-only gaps are left out of this list.

| Cafe | Neighbourhood | Issues |
| --- | --- | --- |
| Acoffee | Milliken | no menu highlights |
| Coffee Dak Lak | Kensington Market | no address; no Google place ID (no live hours, photos or exact location); no photo source |
| Daan Go Cake Lab — Scarborough | Milliken | no drinks listed |
| Daan Go Cake Lab — Spadina | Chinatown | no drinks listed |
| Dear & Fro | Milliken | no Google place ID (no live hours, photos or exact location); no photo source |
| Emmer | Harbord Village | short description |
| Layali El Sharke Coffee House | Wexford | no menu highlights |
| Soul Cafe | Willowdale | no Google place ID (no live hours, photos or exact location); no photo source |
| Soul Made Cafe | Willowdale | no drinks listed |
| The Peachy | Willowdale | no drinks listed |
| The Remarkable Bean | The Beaches | no opening hours |

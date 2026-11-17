# Data quality report

Generated 2026-11-17 by `npx tsx scripts/data-quality.ts --live`. Every count comes from `data/cafes.seed.json`, the same list the site reads.

## Totals

| | Count |
| --- | ---: |
| Records in the data file | 144 |
| Published (shown on the site) | 134 |
| Hidden as permanently closed | 10 |
| Downtown | 56 |
| West End | 22 |
| East End | 14 |
| Midtown | 8 |
| North York | 15 |
| Scarborough | 15 |
| Etobicoke | 4 |

## Coverage

| Check | Cafes affected (of 134) |
| --- | ---: |
| No description | 0 |
| Short description (under 40 characters) | 1 |
| No menu highlights | 2 |
| Food but no drinks listed | 3 |
| No Google place ID | 3 |
| No photo source at all | 3 |
| No photo on Google | 0 |
| No opening hours | 1 |
| No coordinates | 0 |
| Google status not OPERATIONAL | 0 |
| **Have a genuine photo** (editorial or Google) | **131** |
| **Have a website** (editorial or Google) | **122** |
| Invalid website or Instagram URL | 0 |
| Neighbourhood not in the neighbourhood list | 0 |
| No verified amenities (Wi-Fi, patio, laptop) | 131 |

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
| North York | North York | 15 |
| Scarborough | Scarborough | 15 |
| Kensington Market | Downtown | 11 |
| Yorkville | Downtown | 9 |
| Chinatown | Downtown | 7 |
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
| Harbord Village | Downtown | 3 |
| King West | Downtown | 3 |
| Midtown | Midtown | 3 |
| Bay & College | Downtown | 2 |
| Downtown Yonge | Downtown | 2 |
| Liberty Village | West End | 2 |
| Little Portugal | West End | 2 |
| Ossington | West End | 2 |
| Riverside | East End | 2 |
| Roncesvalles | West End | 2 |
| St. Lawrence | Downtown | 2 |
| Trinity Bellwoods | West End | 2 |
| Brockton Village | West End | 1 |
| Cabbagetown | East End | 1 |
| Dupont | Midtown | 1 |
| Entertainment District | Downtown | 1 |
| St. James Town | Downtown | 1 |
| The Beaches | East End | 1 |

## Listings needing work (10)

Amenities-only gaps are left out of this list.

| Cafe | Neighbourhood | Issues |
| --- | --- | --- |
| Acoffee | Scarborough | no menu highlights |
| Coffee Dak Lak | Kensington Market | no address; no Google place ID (no live hours, photos or exact location); no photo source |
| Daan Go Cake Lab — Scarborough | Scarborough | no drinks listed |
| Daan Go Cake Lab — Spadina | Chinatown | no drinks listed |
| Dear & Fro | Scarborough | no Google place ID (no live hours, photos or exact location); no photo source |
| Emmer | Harbord Village | short description |
| Layali El Sharke Coffee House | Scarborough | no menu highlights |
| Soul Cafe | North York | no Google place ID (no live hours, photos or exact location); no photo source |
| Soul Made Cafe | North York | no drinks listed |
| The Remarkable Bean | The Beaches | no opening hours |

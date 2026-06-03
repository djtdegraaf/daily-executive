# Daily Executive — Project Instructies voor Claude Code

## Design Filosofie

Dit project vereist het hoogste frontend design niveau. Vermijd generieke AI-aesthetiek.

### Typografie
- Playfair Display voor alle koppen (bold + italic combinaties)
- EB Garamond voor bodytekst en quotes
- DM Sans Light (300) voor labels, navigatie en datums
- NOOIT Inter, Roboto of Arial gebruiken

### Kleurpalet
- Achtergrond: #F5F0E8 (warm crème)
- Primair: #1a1611 (diep zwart)
- Accent: #8B6914 (goud)

### Design Principes
- Editorial luxury stijl — denk Financial Times
- Asymmetrische grid met royale witruimte
- Subtiele CSS animaties bij page load (staggered fade-in)
- Gouden accenten als scheidingselementen
- Aanvoelen als een premium gedrukt dagblad dat tot leven is gekomen
- Geen generieke AI-aesthetiek of voorspelbare patronen
- Elk detail meticuleus verfijnd op een 8px grid

---

## Data & Content Integriteit

Dit is een kernregel die nooit mag worden overtreden.

### Marktdata
- Alle koersen, indices en prijzen komen ALTIJD uit echte API's
- NOOIT koersen, percentages of grafieken verzinnen of hardcoden
- Als een API niet beschikbaar is, toon dan een duidelijke foutmelding aan de gebruiker
- Toon altijd een timestamp van wanneer data voor het laatst is opgehaald

### Nieuws & Artikelen
- NOOIT artikelen, headlines of quotes verzinnen
- Nieuws komt altijd uit echte bronnen via RSS feeds of nieuwsAPI's
- Bronvermelding is altijd zichtbaar bij elk artikel
- Als er geen nieuws beschikbaar is, toon dan "Geen nieuws beschikbaar"

### Grafieken & Visualisaties
- Alle grafiekdata is altijd gebaseerd op echte historische of live data
- NOOIT dummy data of placeholder waarden gebruiken in productie
- Tijdreeksen komen altijd uit een API, nooit handmatig ingevoerd

### Algemeen
- Placeholder data is alleen toegestaan tijdens lokale ontwikkeling, nooit in de gepubliceerde versie
- Bij API-fouten: toon een duidelijke, nette foutmelding aan de gebruiker

---

## Aanbevolen Data Bronnen (in volgorde van voorkeur)

### Marktdata
1. Alpha Vantage API (primair) — officieel gelicenseerd, institutionele kwaliteit
2. Finnhub API (backup) — royale gratis tier, real-time koersen
3. Twelve Data (grafieken) — tijdreeksen voor AEX, EUR/USD, crypto
4. CoinGecko API (crypto) — volledig gratis, zeer betrouwbaar

### Nieuws (RSS feeds)
1. FD: https://fd.nl/?rss
2. NOS Economie: https://feeds.nos.nl/nosnieuwseconomie
3. NRC: https://www.nrc.nl/rss
4. Reuters Business: https://feeds.reuters.com/reuters/businessNews

### NOOIT gebruiken
- Yahoo Finance (onbetrouwbaar in 2026)
- Hardgecodeerde of verzonnen data
- Niet-geverifieerde of anonieme databronnen

---

## Technische Stack

- HTML, CSS, JavaScript (vanilla of React)
- Hosting via GitHub Pages
- API calls via fetch() met correcte foutafhandeling
- RSS parsing via een serverless functie of CORS-proxy

---

## Taal & Toon

- Alle content is in het Nederlands
- Doelgroep: Nederlandse professional tijdens woon-werkverkeer
- Toon: gezaghebbend, helder, beknopt — geen jargon zonder uitleg
- Geen clickbait koppen, altijd feitelijk en onderbouwd

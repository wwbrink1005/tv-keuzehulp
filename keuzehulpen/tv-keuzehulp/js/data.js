export const distanceToSizeGroup = {
  "1m": "24-32",
  "1.5m": "24-32",
  "2m": "40-43",
  "2.5m": "48-50",
  "3m": "58-65",
  "3.5m": "70-77",
  "4m": "83-86",
  "bioscoop": "97-115"
};

export const tvDimensions = {
  "24-32": { width: 131.20, height: 73.87 },
  "40-43": { width: 176.30, height: 99.17 },
  "48-50": { width: 205.01, height: 115.28 },
  "55": { width:  225.49, height: 126.84 },
  "58-65": { width: 266.494, height: 149.90 },
  "70-77": { width: 307.50, height: 172.97 },
  "83-86": { width: 348.49, height: 196.03 },
  "97-115": { width: 401.79, height: 226.01 }
};

export const sizeGroupToAllowedSizes = {
  "24-32": [24, 27, 28, 29, 30, 31, 32],
  "40-43": [40, 42, 43],
  "48-50": [48, 50],
  "55": [55],
  "58-65": [58, 60, 65],
  "70-77": [70, 75, 77],
  "83-86": [83, 85, 86],
  "97-115": [97, 98, 100, 115]
};

export const priceGroupsBySize = {
  "24-32": [
    { label: "100-300", min: 100, max: 300 },
    { label: "300-600", min: 300, max: 600 }
  ],
  "40-43": [
    { label: "150-500", min: 150, max: 500 },
    { label: "500-1000", min: 500, max: 1000 },
    { label: "1000-1500", min: 1000, max: 1500 }
  ],
  "48-50": [
    { label: "250-500", min: 250, max: 500 },
    { label: "500-1000", min: 500, max: 1000 },
    { label: "1000+", min: 1000, max: Number.POSITIVE_INFINITY }
  ],
  "55": [
    { label: "300-800", min: 300, max: 800 },
    { label: "800-2000", min: 800, max: 2000 },
    { label: "2000+", min: 2000, max: Number.POSITIVE_INFINITY }
  ],
  "58-65": [
    { label: "300-1000", min: 300, max: 1000 },
    { label: "1000-2000", min: 1000, max: 2000 },
    { label: "2000+", min: 2000, max: Number.POSITIVE_INFINITY }
  ],
  "70-77": [
    { label: "500-1500", min: 500, max: 1500 },
    { label: "1500-3000", min: 1500, max: 3000 },
    { label: "3000+", min: 3000, max: Number.POSITIVE_INFINITY }
  ],
  "83-86": [
    { label: "850-2000", min: 850, max: 2000 },
    { label: "2000-4000", min: 2000, max: 4000 },
    { label: "4000+", min: 4000, max: Number.POSITIVE_INFINITY }
  ],
  "97-115": [
    { label: "1400-2500", min: 1400, max: 2500 },
    { label: "2500-10000", min: 2500, max: 10000 },
    { label: "10000+", min: 10000, max: Number.POSITIVE_INFINITY }
  ]
};

// Types that realistically exist per size group.
// Only these types are considered during matching for each size group.
export const availableTypesBySize = {
  "24-32": ["LED", "QLED"],
  "40-43": ["LED", "QLED", "Mini LED", "OLED"],
  "48-50": ["LED", "QLED", "Mini LED", "OLED"],
  "55":    ["LED", "QLED", "Mini LED", "OLED"],
  "58-65": ["LED", "QLED", "Mini LED", "OLED"],
  "70-77": ["LED", "QLED", "Mini LED", "OLED"],
  "83-86": ["LED", "QLED", "Mini LED", "OLED"],
  "97-115":["LED", "QLED", "Mini LED"]
};

// Extra score bonus added to LED to reflect that at small screen sizes
// the perceptual difference between LED and premium types is minimal.
export const ledSizeBonuses = {
  "24-32": 10,
  "40-43":  3
};

export const scoringSystem = {
  usage: {
    films: { "LED": 5, "Mini LED": 8, "QLED": 7, "OLED": 10 },
    sport: { "LED": 7, "Mini LED": 9, "QLED": 9, "OLED": 7 },
    gamen: { "LED": 6, "Mini LED": 9, "QLED": 8, "OLED": 9 },
    normaal: { "LED": 8, "Mini LED": 5, "QLED": 7, "OLED": 5 }
  },
  quality: {
    best: { "LED": 4, "Mini LED": 8, "QLED": 7, "OLED": 10 },
    belangrijk: { "LED": 6, "Mini LED": 9, "QLED": 8, "OLED": 7 },
    prima: { "LED": 9, "Mini LED": 4, "QLED": 5, "OLED": 2 }
  },
  timing: {
    avonds: { "LED": 7, "Mini LED": 8, "QLED": 6, "OLED": 10 },
    overdag: { "LED": 8, "Mini LED": 9, "QLED": 10, "OLED": 5 },
    beide: { "LED": 8, "Mini LED": 9, "QLED": 9, "OLED": 8 },
    nvt: { "LED": 9, "Mini LED": 5, "QLED": 5, "OLED": 5 }
  },
  viewing: {
    recht: { "LED": 8, "Mini LED": 8, "QLED": 8, "OLED": 9 },
    meerdere: { "LED": 6, "Mini LED": 8, "QLED": 7, "OLED": 10 },
    nvt: { "LED": 0, "Mini LED": 0, "QLED": 0, "OLED": 0 }
  },
  extra: {
    zwart: { "LED": 5, "Mini LED": 7, "QLED": 6, "OLED": 10 },
    helderheid: { "LED": 7, "Mini LED": 9, "QLED": 10, "OLED": 6 },
    kleur: { "LED": 6, "Mini LED": 8, "QLED": 10, "OLED": 9 },
    niks: { "LED": 6, "Mini LED": 5, "QLED": 5, "OLED": 5 }
  }
};

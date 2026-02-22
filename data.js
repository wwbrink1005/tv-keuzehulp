export const distanceToSizeGroup = {
  "1m": "24",
  "1.5m": "27-32",
  "2m": "40-43",
  "2.5m": "48-50",
  "3m": "58-65",
  "3.5m": "70-77",
  "4m": "83-86",
  "bioscoop": "97-115"
};

export const tvDimensions = {
  "24": { width: 103.57, height: 58.26 },
  "27-32": { width: 138.11, height: 77.76 },
  "40-43": { width: 185.58, height: 104.39 },
  "48-50": { width: 215.79, height: 121.38 },
  "55": { width:  237.36, height: 133.52 },
  "58-65": { width: 280.52, height: 157.79 },
  "70-77": { width: 323.68, height: 182.07 },
  "83-86": { width: 366.84, height: 206.35 },
  "97-115": { width: 422.94, height: 237.91 }
};

export const sizeGroupToAllowedSizes = {
  "24": [24],
  "27-32": [27, 28, 29, 30, 31, 32],
  "40-43": [40, 42, 43],
  "48-50": [48, 50],
  "55": [55],
  "58-65": [58, 60, 65],
  "70-77": [70, 75, 77],
  "83-86": [83, 85, 86],
  "97-115": [97, 98, 100, 115]
};

export const priceGroupsBySize = {
  "24": [
    { label: "100-150", min: 100, max: 150 },
    { label: "150-250", min: 150, max: 250 }
  ],
  "27-32": [
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

export const scoringSystem = {
  usage: {
    films: { "LED (edge)": 4, "LED (direct)": 5, "Mini LED": 8, "QLED": 7, "OLED": 10 },
    sport: { "LED (edge)": 6, "LED (direct)": 7, "Mini LED": 9, "QLED": 9, "OLED": 7 },
    gamen: { "LED (edge)": 5, "LED (direct)": 6, "Mini LED": 9, "QLED": 8, "OLED": 9 },
    normaal: { "LED (edge)": 9, "LED (direct)": 8, "Mini LED": 5, "QLED": 7, "OLED": 5 }
  },
  quality: {
    best: { "LED (edge)": 1, "LED (direct)": 4, "Mini LED": 8, "QLED": 7, "OLED": 10 },
    belangrijk: { "LED (edge)": 5, "LED (direct)": 6, "Mini LED": 9, "QLED": 8, "OLED": 7 },
    prima: { "LED (edge)": 10, "LED (direct)": 9, "Mini LED": 4, "QLED": 5, "OLED": 2 }
  },
  timing: {
    avonds: { "LED (edge)": 6, "LED (direct)": 7, "Mini LED": 8, "QLED": 6, "OLED": 10 },
    overdag: { "LED (edge)": 7, "LED (direct)": 8, "Mini LED": 9, "QLED": 10, "OLED": 5 },
    beide: { "LED (edge)": 7, "LED (direct)": 8, "Mini LED": 9, "QLED": 9, "OLED": 8 },
    nvt: { "LED (edge)": 10, "LED (direct)": 9, "Mini LED": 5, "QLED": 5, "OLED": 5 }
  },
  viewing: {
    recht: { "LED (edge)": 8, "LED (direct)": 8, "Mini LED": 8, "QLED": 8, "OLED": 9 },
    meerdere: { "LED (edge)": 5, "LED (direct)": 6, "Mini LED": 8, "QLED": 7, "OLED": 10 },
    nvt: { "LED (edge)": 0, "LED (direct)": 0, "Mini LED": 0, "QLED": 0, "OLED": 0 }
  },
  extra: {
    zwart: { "LED (edge)": 3, "LED (direct)": 5, "Mini LED": 7, "QLED": 6, "OLED": 10 },
    helderheid: { "LED (edge)": 6, "LED (direct)": 7, "Mini LED": 9, "QLED": 10, "OLED": 6 },
    kleur: { "LED (edge)": 5, "LED (direct)": 6, "Mini LED": 8, "QLED": 10, "OLED": 9 },
    ambilight: { "LED (edge)": 0, "LED (direct)": 0, "Mini LED": 0, "QLED": 0, "OLED": 0 },
    niks: { "LED (edge)": 10, "LED (direct)": 9, "Mini LED": 5, "QLED": 5, "OLED": 5 }
  }
};

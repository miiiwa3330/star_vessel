/**
 * 太陽・惑星・月・冥王星の、図鑑の詳細に出す数（要件 F38。2026-11-12）。
 * 出典：NASA Goddard Space Flight Center の Planetary Fact Sheet - Metric（https://nssdc.gsfc.nasa.gov/planetary/factsheet/ 、
 * 最終更新 2025-03-18、取得 2026-11-13）と Sun Fact Sheet（https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html）。
 * 値は表のまま写した（丸めていない）。変えるときは出典の表と見比べる。決まりは docs/tech/collection.md
 */
export interface PlanetFacts {
  /** 質量（10^24 kg） */
  mass1e24Kg: number;
  /** 平均密度（kg/m³） */
  densityKgM3: number;
  /** 表面の重力（m/s²） */
  gravityMS2: number;
  /** 脱出速度（km/s） */
  escapeKmS: number;
  /** 1 日の長さ（時間。太陽が南中してから次に南中するまで） */
  dayHours?: number;
  /** 平均の温度（℃） */
  meanTempC?: number;
  /** 表面の気圧（気圧。null は「分からない」＝表面が無いガスの惑星） */
  surfacePressureBar?: number | null;
  /** 衛星の数（表の時点） */
  moons?: number;
  /** 自転の軸の傾き（度） */
  obliquityDeg?: number;
  /** 公転の速さ（km/s） */
  orbitalSpeedKmS?: number;
  rings?: boolean;
  /** 全体の磁場（null は分からない） */
  magneticField?: boolean | null;
  /** 太陽からの平均の距離・近日点・遠日点（10^6 km。月は地球からの距離） */
  distance1e6Km?: number;
  perihelion1e6Km?: number;
  aphelion1e6Km?: number;
  /** 公転の周期（日） */
  orbitalPeriodDays?: number;
  /** 軌道の傾き（度）・離心率 */
  inclinationDeg?: number;
  eccentricity?: number;
}

export const PLANET_FACTS: Readonly<Record<string, PlanetFacts>> = {
  Mercury: { mass1e24Kg: 0.33, densityKgM3: 5429, gravityMS2: 3.7, escapeKmS: 4.3, dayHours: 4222.6, meanTempC: 167, surfacePressureBar: 0, moons: 0, obliquityDeg: 0.034, orbitalSpeedKmS: 47.4, rings: false, magneticField: true, distance1e6Km: 57.9, perihelion1e6Km: 46.0, aphelion1e6Km: 69.8, orbitalPeriodDays: 88.0, inclinationDeg: 7.0, eccentricity: 0.206 },
  Venus: { mass1e24Kg: 4.87, densityKgM3: 5243, gravityMS2: 8.9, escapeKmS: 10.4, dayHours: 2802.0, meanTempC: 464, surfacePressureBar: 92, moons: 0, obliquityDeg: 177.4, orbitalSpeedKmS: 35.0, rings: false, magneticField: false, distance1e6Km: 108.2, perihelion1e6Km: 107.5, aphelion1e6Km: 108.9, orbitalPeriodDays: 224.7, inclinationDeg: 3.4, eccentricity: 0.007 },
  Earth: { mass1e24Kg: 5.97, densityKgM3: 5514, gravityMS2: 9.8, escapeKmS: 11.2, dayHours: 24.0, meanTempC: 15, surfacePressureBar: 1, moons: 1, obliquityDeg: 23.4, orbitalSpeedKmS: 29.8, rings: false, magneticField: true, distance1e6Km: 149.6, perihelion1e6Km: 147.1, aphelion1e6Km: 152.1, orbitalPeriodDays: 365.2, inclinationDeg: 0.0, eccentricity: 0.017 },
  Moon: { mass1e24Kg: 0.073, densityKgM3: 3340, gravityMS2: 1.6, escapeKmS: 2.4, dayHours: 708.7, meanTempC: -20, surfacePressureBar: 0, obliquityDeg: 6.7, orbitalSpeedKmS: 1.0, rings: false, magneticField: false, distance1e6Km: 0.384, perihelion1e6Km: 0.363, aphelion1e6Km: 0.406, orbitalPeriodDays: 27.3, inclinationDeg: 5.1, eccentricity: 0.055 },
  Mars: { mass1e24Kg: 0.642, densityKgM3: 3934, gravityMS2: 3.7, escapeKmS: 5.0, dayHours: 24.7, meanTempC: -65, surfacePressureBar: 0.01, moons: 2, obliquityDeg: 25.2, orbitalSpeedKmS: 24.1, rings: false, magneticField: false, distance1e6Km: 228.0, perihelion1e6Km: 206.7, aphelion1e6Km: 249.3, orbitalPeriodDays: 687.0, inclinationDeg: 1.8, eccentricity: 0.094 },
  Jupiter: { mass1e24Kg: 1898, densityKgM3: 1326, gravityMS2: 23.1, escapeKmS: 59.5, dayHours: 9.9, meanTempC: -110, surfacePressureBar: null, moons: 95, obliquityDeg: 3.1, orbitalSpeedKmS: 13.1, rings: true, magneticField: true, distance1e6Km: 778.5, perihelion1e6Km: 740.6, aphelion1e6Km: 816.4, orbitalPeriodDays: 4331, inclinationDeg: 1.3, eccentricity: 0.049 },
  Saturn: { mass1e24Kg: 568, densityKgM3: 687, gravityMS2: 9.0, escapeKmS: 35.5, dayHours: 10.7, meanTempC: -140, surfacePressureBar: null, moons: 274, obliquityDeg: 26.7, orbitalSpeedKmS: 9.7, rings: true, magneticField: true, distance1e6Km: 1432.0, perihelion1e6Km: 1357.6, aphelion1e6Km: 1506.5, orbitalPeriodDays: 10747, inclinationDeg: 2.5, eccentricity: 0.052 },
  Uranus: { mass1e24Kg: 86.8, densityKgM3: 1270, gravityMS2: 8.7, escapeKmS: 21.3, dayHours: 17.2, meanTempC: -195, surfacePressureBar: null, moons: 28, obliquityDeg: 97.8, orbitalSpeedKmS: 6.8, rings: true, magneticField: true, distance1e6Km: 2867.0, perihelion1e6Km: 2732.7, aphelion1e6Km: 3001.4, orbitalPeriodDays: 30589, inclinationDeg: 0.8, eccentricity: 0.047 },
  Neptune: { mass1e24Kg: 102, densityKgM3: 1638, gravityMS2: 11.0, escapeKmS: 23.5, dayHours: 16.1, meanTempC: -200, surfacePressureBar: null, moons: 16, obliquityDeg: 28.3, orbitalSpeedKmS: 5.4, rings: true, magneticField: true, distance1e6Km: 4515.0, perihelion1e6Km: 4471.1, aphelion1e6Km: 4558.9, orbitalPeriodDays: 59800, inclinationDeg: 1.8, eccentricity: 0.01 },
  Pluto: { mass1e24Kg: 0.013, densityKgM3: 1850, gravityMS2: 0.7, escapeKmS: 1.3, dayHours: 153.3, meanTempC: -225, surfacePressureBar: 0.00001, moons: 5, obliquityDeg: 119.5, orbitalSpeedKmS: 4.7, rings: false, magneticField: null, distance1e6Km: 5906.4, perihelion1e6Km: 4436.8, aphelion1e6Km: 7375.9, orbitalPeriodDays: 90560, inclinationDeg: 17.2, eccentricity: 0.244 },
};

/** 太陽（Sun Fact Sheet） */
export const SUN_FACTS = {
  mass1e24Kg: 1_988_400,
  densityKgM3: 1408,
  gravityMS2: 274.0,
  escapeKmS: 617.6,
  /** 光度（10^24 W） */
  luminosity1e24W: 382.8,
  spectralType: 'G2 V',
  absoluteMag: 4.83,
  /** 地球から見た明るさ（等級） */
  apparentMag: -26.74,
  /** 中心の温度（K） */
  centralTempK: 1.571e7,
  /** 自転の周期（時間。緯度 16 度での値。緯度で違う） */
  rotationHours: 609.12,
  /** 近くの恒星に対する速さ（km/s） */
  speedKmS: 19.4,
} as const;

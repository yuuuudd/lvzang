export function validatePrintSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('打印设置必须为对象');
  const result = { colors: 1, widthMm: 60, magnetDiameter: 6, magnetDepth: 2, clearance: 0.2 };
  const limits = { colors: [1, 4], widthMm: [40, 120], magnetDiameter: [2, 12], magnetDepth: [1, 8], clearance: [0, 0.6] };
  for (const key of Object.keys(result)) {
    const value = input[key] ?? result[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < limits[key][0] || value > limits[key][1]) throw new Error(`${key} 必须在 ${limits[key].join('–')} 范围内`);
    result[key] = value;
  }
  if (!Number.isInteger(result.colors)) throw new Error('颜色数量必须为整数');
  return result;
}

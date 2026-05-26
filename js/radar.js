/**
 * radar.js — Chart.js radar chart wrapper
 * Theme-aware radar with dual datasets (initial vs current values)
 */

let chartInstance = null;

/**
 * Initialize or re-initialize the radar chart
 * @param {string} canvasId — ID of the <canvas> element
 * @param {Array} dimensions — array of { name, default, value, min, max }
 */
export function initRadar(canvasId, dimensions) {
  destroyRadar();

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const labels = dimensions.map(d => d.name);
  const defaults = dimensions.map(d => d.default);
  const values = dimensions.map(d => d.value);
  const palette = getRadarPalette();

  chartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: '初始值',
          data: defaults,
          backgroundColor: palette.initialFill,
          borderColor: palette.initialStroke,
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointBackgroundColor: palette.initialPoint,
          pointBorderColor: palette.pointBorder,
          pointBorderWidth: 1.5,
          pointRadius: 3.5,
          pointHoverRadius: 5,
        },
        {
          label: '当前值',
          data: values,
          backgroundColor: palette.currentFill,
          borderColor: palette.currentStroke,
          borderWidth: 2.5,
          pointBackgroundColor: palette.currentPoint,
          pointBorderColor: palette.pointBorder,
          pointBorderWidth: 2,
          pointRadius: 4.5,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            display: false,
            stepSize: 20,
          },
          grid: {
            color: palette.grid,
            lineWidth: 1,
          },
          angleLines: {
            color: palette.grid,
            lineWidth: 1,
          },
          pointLabels: {
            font: {
              family: "'Inter', 'LXGW WenKai Screen', system-ui, sans-serif",
              size: 12,
              weight: '500',
            },
            color: palette.label,
            padding: 12,
          },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11, family: "'Inter', 'LXGW WenKai Screen', system-ui" },
            padding: 20,
            usePointStyle: true,
            pointStyleWidth: 8,
            color: palette.label,
          },
        },
        tooltip: {
          backgroundColor: palette.tooltipBg,
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
        },
      },
      animation: {
        duration: 500,
        easing: 'easeOutQuart',
      },
    },
  });
}

/**
 * Update the "当前值" dataset with new dimension values
 * @param {Array} dimensions — array of { value }
 */
export function updateRadarValues(dimensions) {
  if (!chartInstance) return;
  chartInstance.data.datasets[1].data = dimensions.map(d => d.value);
  chartInstance.update('active');
}

/**
 * Destroy the chart instance
 */
export function destroyRadar() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

/**
 * Get the current chart instance
 */
export function getRadarInstance() {
  return chartInstance;
}

/**
 * Refresh chart colors after Candy/Pro or light/dark theme changes.
 */
export function refreshRadarTheme() {
  if (!chartInstance) return;
  applyRadarPalette(chartInstance, getRadarPalette());
  chartInstance.update('none');
}

function applyRadarPalette(chart, palette) {
  const [initial, current] = chart.data.datasets || [];
  if (initial) {
    initial.backgroundColor = palette.initialFill;
    initial.borderColor = palette.initialStroke;
    initial.pointBackgroundColor = palette.initialPoint;
    initial.pointBorderColor = palette.pointBorder;
  }
  if (current) {
    current.backgroundColor = palette.currentFill;
    current.borderColor = palette.currentStroke;
    current.pointBackgroundColor = palette.currentPoint;
    current.pointBorderColor = palette.pointBorder;
  }

  const scale = chart.options.scales?.r;
  if (scale) {
    if (scale.grid) scale.grid.color = palette.grid;
    if (scale.angleLines) scale.angleLines.color = palette.grid;
    if (scale.pointLabels) scale.pointLabels.color = palette.label;
  }

  const legendLabels = chart.options.plugins?.legend?.labels;
  if (legendLabels) legendLabels.color = palette.label;

  const tooltip = chart.options.plugins?.tooltip;
  if (tooltip) tooltip.backgroundColor = palette.tooltipBg;
}

function getRadarPalette() {
  const isPro = document.documentElement.dataset.uiMode === 'pro';
  const textPrimary = readCssColor('--color-text-primary', '#2D2B3D');
  const textSecondary = readCssColor('--color-text-secondary', '#6B6880');
  const border = readCssColor('--color-border', '#F0E6F0');
  const card = readCssColor('--color-bg-card', '#FFFFFF');
  const input = readCssColor('--color-bg-input', '#FDFAFF');
  const candyPink = readCssColor('--color-candy-pink', '#FF8FAB');
  const candyLavender = readCssColor('--color-candy-lavender', '#C3A6FF');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  if (isPro) {
    const proInitial = readCssColor('--color-candy-sky', isDark ? '#67747A' : '#476478');
    const proCurrent = readCssColor('--color-candy-lemon', '#D4B06A');

    return {
      initialFill: withAlpha(proInitial, 0.1),
      initialStroke: withAlpha(proInitial, 0.68),
      initialPoint: proInitial,
      currentFill: withAlpha(proCurrent, isDark ? 0.2 : 0.16),
      currentStroke: withAlpha(proCurrent, 0.95),
      currentPoint: proCurrent,
      pointBorder: card,
      grid: withAlpha(border, 0.75),
      label: textSecondary,
      tooltipBg: isDark ? withAlpha(input, 0.96) : withAlpha(textPrimary, 0.92),
    };
  }

  return {
    initialFill: withAlpha(candyLavender, 0.12),
    initialStroke: withAlpha(candyLavender, 0.55),
    initialPoint: candyLavender,
    currentFill: withAlpha(candyPink, 0.18),
    currentStroke: withAlpha(candyPink, 0.8),
    currentPoint: candyPink,
    pointBorder: card,
    grid: withAlpha(border, 0.6),
    label: textSecondary,
    tooltipBg: 'rgba(45, 43, 61, 0.88)',
  };
}

function readCssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function withAlpha(color, alpha) {
  const value = color.trim();
  const hex = value.replace('#', '');

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const [r, g, b] = hex.split('').map((ch) => parseInt(ch + ch, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const channels = rgbMatch[1].split(',').slice(0, 3).map((item) => item.trim()).join(', ');
    return `rgba(${channels}, ${alpha})`;
  }

  return value;
}

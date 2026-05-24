/**
 * radar.js — Chart.js radar chart wrapper
 * Candy-colored radar with dual datasets (initial vs current values)
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

  chartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: '初始值',
          data: defaults,
          backgroundColor: 'rgba(195, 166, 255, 0.12)',
          borderColor: 'rgba(195, 166, 255, 0.55)',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointBackgroundColor: '#C3A6FF',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 3.5,
          pointHoverRadius: 5,
        },
        {
          label: '当前值',
          data: values,
          backgroundColor: 'rgba(255, 143, 171, 0.18)',
          borderColor: 'rgba(255, 143, 171, 0.8)',
          borderWidth: 2.5,
          pointBackgroundColor: '#FF8FAB',
          pointBorderColor: '#fff',
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
            color: 'rgba(240, 230, 240, 0.6)',
            lineWidth: 1,
          },
          angleLines: {
            color: 'rgba(240, 230, 240, 0.6)',
            lineWidth: 1,
          },
          pointLabels: {
            font: {
              family: "'Inter', 'LXGW WenKai Screen', system-ui, sans-serif",
              size: 12,
              weight: '500',
            },
            color: '#6B6880',
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
            color: '#6B6880',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(45, 43, 61, 0.88)',
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

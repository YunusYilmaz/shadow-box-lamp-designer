/**
 * Natural cubic spline interpolation
 * Much smoother than linear interpolation while passing through all data points
 */
export class CubicSpline {
  /**
   * @param {number[]} xs - knot x values (sorted ascending)
   * @param {number[]} ys - knot y values
   */
  constructor(xs, ys) {
    const n = xs.length;
    if (n < 2) {
      this._constant = ys[0] || 0;
      this._valid = false;
      return;
    }
    this._valid = true;
    this.xs = xs;
    this.ys = ys;

    // Compute natural cubic spline coefficients
    const h = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i];

    // Tridiagonal system for second derivatives
    const alpha = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
    }

    const l = new Float64Array(n);
    const mu = new Float64Array(n);
    const z = new Float64Array(n);
    l[0] = 1;

    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    l[n - 1] = 1;
    const c = new Float64Array(n);
    const b = new Float64Array(n - 1);
    const d = new Float64Array(n - 1);

    for (let j = n - 2; j >= 0; j--) {
      c[j] = z[j] - mu[j] * c[j + 1];
      b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
      d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
    }

    this.a = ys;
    this.b = b;
    this.c = c;
    this.d = d;
  }

  /**
   * Evaluate the spline at x
   * @param {number} x
   * @returns {number}
   */
  evaluate(x) {
    if (!this._valid) return this._constant;

    const { xs, a, b, c, d } = this;
    const n = xs.length;

    // Clamp to range
    if (x <= xs[0]) return a[0];
    if (x >= xs[n - 1]) return a[n - 1];

    // Binary search for interval
    let lo = 0, hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid + 1] < x) lo = mid + 1;
      else hi = mid;
    }

    const dx = x - xs[lo];
    return a[lo] + b[lo] * dx + c[lo] * dx * dx + d[lo] * dx * dx * dx;
  }
}

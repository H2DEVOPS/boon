/**
 * Minimal web scaffold — fetch health, log response.
 * No framework. No UI / DOM.
 */

const HEALTH_URL = "http://localhost:3000/health";

const res = await fetch(HEALTH_URL);
const data = await res.json();

console.log("status:", res.status);
console.log("body:", data);

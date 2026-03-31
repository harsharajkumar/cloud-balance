import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REQUIRED_HEADERS = ['timestamp', 'cpu_percent', 'memory_mb', 'requests_per_sec', 'pod_count'];

/**
 * Read and parse traffic.csv dataset
 */
export function readTrafficDataset() {
  try {
    const dataPath = path.join(__dirname, '../../data/traffic.csv');
    const csvData = fs.readFileSync(dataPath, 'utf-8');
    
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    const missingHeaders = REQUIRED_HEADERS.filter(header => !headers.includes(header));

    if (missingHeaders.length > 0) {
      throw new Error(`traffic.csv missing required columns: ${missingHeaders.join(', ')}`);
    }
    
    const data = lines.slice(1).map(line => {
      const values = line.split(',');
      return {
        timestamp: values[0],
        cpu_percent: parseFloat(values[1]) || 0,
        memory_mb: parseFloat(values[2]) || 0,
        requests_per_sec: parseFloat(values[3]) || 0,
        pod_count: parseInt(values[4]) || 1,
      };
    });
    
    return data;
  } catch (error) {
    console.error('Error reading dataset:', error);
    return [];
  }
}

/**
 * Get current traffic data point (simulates real-time)
 */
let currentIndex = 0;
export function getCurrentTrafficData() {
  const dataset = readTrafficDataset();
  if (dataset.length === 0) return null;
  
  const data = dataset[currentIndex % dataset.length];
  currentIndex++;
  
  return data;
}

export function getLatestTrafficData() {
  const dataset = readTrafficDataset();
  if (dataset.length === 0) return null;

  return dataset[dataset.length - 1];
}

/**
 * Calculate required replicas based on request count
 */
export function calculateReplicas(requestsPerSec) {
  if (requestsPerSec <= 50) return 1;
  if (requestsPerSec <= 120) return 2;
  if (requestsPerSec <= 200) return 3;
  return 4;
}

/**
 * Reset simulation to start
 */
export function resetSimulation() {
  currentIndex = 0;
}

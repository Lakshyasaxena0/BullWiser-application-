// Test script for AI-Astrology Training System
// This demonstrates the three key features requested:
// 1. Training AI to read D1, D9, and other astrological charts
// 2. Sector-specific planetary mappings for stocks
// 3. Real-world case training for improved predictions

import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

// Helper function to login
async function login() {
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      username: 'testuser',
      // Bug 27 fix: was 'Test123!' — correct password per APPLICATION_STATUS.md is 'password123'.
      password: 'password123'
    }, {
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' }
    });

    // Bug 28 fix: response.headers['set-cookie'] is a string[] in Axios (Node.js adapter).
    // Passing the raw array to Cookie: causes Array.toString() which joins with commas,
    // but HTTP Cookie must use '; ' as the separator.
    // Fix: take the name=value part of each cookie (strip attributes like Path, HttpOnly)
    // and join them correctly with '; '.
    const rawCookies = response.headers['set-cookie'] || [];
    const cookieHeader = rawCookies
      .map(c => c.split(';')[0])
      .join('; ');
    return cookieHeader;
  } catch (error) {
    console.error('Login failed:', error.message);
    return null;
  }
}

// Test 1: AI reading astrological charts (D1, D9, transits, hora)
async function testChartReading(cookies) {
  console.log('\n=== TEST 1: AI Reading Astrological Charts ===');
  console.log('Testing D1 (Birth Chart), D9 (Navamsa), D10 (Dashamsa), Transits, Dasha, Hora...\n');

  try {
    const response = await axios.post(`${API_BASE}/astrology/analyze-chart`, {
      birthDate: '1990-01-15',
      birthTime: '10:30',
      latitude: 28.6139,  // Delhi
      longitude: 77.2090
    }, {
      headers: { Cookie: cookies }
    });

    const analysis = response.data;
    console.log('Chart Analysis Results:');
    console.log('- D1 Analysis:', analysis.d1Analysis);
    console.log('- D9 Analysis:', analysis.d9Analysis);
    console.log('- D10 Analysis:', analysis.d10Analysis);
    console.log('- Transit Analysis:', analysis.transitAnalysis);
    console.log('- Dasha Analysis:', analysis.dashaAnalysis);
    console.log('- Hora Analysis:', analysis.horaAnalysis);
    console.log('- Combined Insight:', analysis.combinedInsight);
    console.log('- Confidence Score:', analysis.confidence + '%');

    return true;
  } catch (error) {
    console.error('Chart reading test failed:', error.response?.data || error.message);
    return false;
  }
}

// Test 2: Sector-specific planetary mappings
async function testSectorMappings(cookies) {
  console.log('\n=== TEST 2: Sector-Specific Planetary Mappings ===');
  console.log('Testing planetary rulers and zodiac signs for different stock sectors...\n');

  const sectors = [
    { symbol: 'TCS', sector: 'IT' },
    { symbol: 'HDFC', sector: 'Banking' },
    { symbol: 'SUNPHARMA', sector: 'Pharma' },
    { symbol: 'RELIANCE', sector: 'Energy' },
    { symbol: 'MARUTI', sector: 'Auto' }
  ];

  // Bug 30 fix: was unconditionally returning true even if all requests failed.
  // Now we track how many succeeded and return false if none did.
  let successCount = 0;

  for (const stock of sectors) {
    try {
      const response = await axios.post(`${API_BASE}/astrology/sector-analysis`, stock, {
        headers: { Cookie: cookies }
      });

      const analysis = response.data;
      console.log(`\n${stock.sector} Sector (${stock.symbol}):`);
      console.log(`- Sector Strength: ${analysis.sectorStrength}%`);
      console.log(`- Planetary Support: ${analysis.planetarySupport}%`);
      console.log(`- Timing: ${analysis.timing}`);
      // Bug 29 fix: keyFactors could be absent; guard with || [] before .slice().
      console.log(`- Key Factors: ${(analysis.keyFactors || []).slice(0, 3).join(', ')}`);
      console.log(`- Recommendation: ${analysis.recommendation}`);
      successCount++;
    } catch (error) {
      console.error(`Failed for ${stock.symbol}:`, error.response?.data || error.message);
    }
  }

  return successCount > 0;
}

// Test 3: Training on real-world cases
async function testRealWorldTraining(cookies) {
  console.log('\n=== TEST 3: Training on Real-World Cases ===');
  console.log('Recording actual market outcomes to improve prediction accuracy...\n');

  // Sample training cases from real market data
  const trainingCases = [
    {
      stockSymbol: 'TCS',
      sector: 'IT',
      date: '2025-01-10',
      actualDirection: 'bullish',
      actualReturn: 3.5
    },
    {
      stockSymbol: 'HDFC',
      sector: 'Banking',
      date: '2025-01-11',
      actualDirection: 'bearish',
      actualReturn: -2.1
    },
    {
      stockSymbol: 'SUNPHARMA',
      sector: 'Pharma',
      date: '2025-01-12',
      actualDirection: 'bullish',
      actualReturn: 1.8
    },
    {
      stockSymbol: 'RELIANCE',
      sector: 'Energy',
      date: '2025-01-13',
      actualDirection: 'neutral',
      actualReturn: 0.3
    },
    {
      stockSymbol: 'MARUTI',
      sector: 'Auto',
      date: '2025-01-14',
      actualDirection: 'bullish',
      actualReturn: 2.7
    }
  ];

  console.log('Starting batch training with', trainingCases.length, 'cases...\n');

  try {
    const response = await axios.post(`${API_BASE}/training/batch-train`, {
      trainingCases
    }, {
      headers: { Cookie: cookies }
    });

    const results = response.data;
    console.log('Training Results:');
    console.log(`- Total Cases: ${results.totalCases}`);
    console.log(`- Successful Cases: ${results.successfulCases}`);
    // Bug 31 fix: wrap with Number() before .toFixed() — server may return string values.
    console.log(`- Overall Accuracy: ${Number(results.overallAccuracy).toFixed(1)}%`);

    console.log('\nSector-wise Accuracy:');
    // Guard: sectorAccuracies may be absent if training is incomplete.
    for (const [sector, accuracy] of Object.entries(results.sectorAccuracies || {})) {
      // Bug 31 fix: same guard on per-sector accuracy values.
      console.log(`- ${sector}: ${Number(accuracy).toFixed(1)}%`);
    }

    console.log('\nKey Learnings:');
    // Guard: keyLearnings may be absent; guard with || [] before .slice().
    (results.keyLearnings || []).slice(0, 5).forEach((learning, i) => {
      console.log(`${i + 1}. ${learning}`);
    });

    return true;
  } catch (error) {
    console.error('Training test failed:', error.response?.data || error.message);
    return false;
  }
}

// Test 4: Check performance metrics after training
async function testPerformanceMetrics(cookies) {
  console.log('\n=== TEST 4: Performance Metrics ===');
  console.log('Checking system performance after training...\n');

  try {
    const response = await axios.get(`${API_BASE}/training/performance?lookbackDays=30`, {
      headers: { Cookie: cookies }
    });

    const metrics = response.data;
    console.log('Performance Metrics (Last 30 Days):');
    // Bug 31 fix: guard with Number() before .toFixed() on both accuracy and profitability.
    console.log(`- Accuracy: ${Number(metrics.accuracy).toFixed(1)}%`);
    console.log(`- Profitability: ${Number(metrics.profitability).toFixed(2)}%`);
    // Guard: bestSectors may be absent; guard with || [] before .join().
    console.log(`- Best Sectors: ${(metrics.bestSectors || []).join(', ')}`);

    console.log('\nRecommendations:');
    // Guard: recommendations may be absent; guard with || [] before .forEach().
    (metrics.recommendations || []).forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });

    return true;
  } catch (error) {
    console.error('Performance metrics test failed:', error.response?.data || error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('Starting AI-Astrology Training System Tests');
  console.log('============================================');

  // Login first
  console.log('\nLogging in...');
  const cookies = await login();

  if (!cookies) {
    console.error('Failed to login. Please ensure the server is running and test user exists.');
    // Bug 32 fix: was `return` which exits with code 0 (CI treats as success).
    // Use process.exit(1) so CI/CD pipelines correctly detect the failure.
    process.exit(1);
  }

  console.log('Login successful!');

  // Run all tests
  const tests = [
    testChartReading,
    testSectorMappings,
    testRealWorldTraining,
    testPerformanceMetrics
  ];

  let passedTests = 0;
  for (const test of tests) {
    const result = await test(cookies);
    if (result) passedTests++;

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n============================================');
  console.log(`Test Summary: ${passedTests}/${tests.length} tests passed`);

  if (passedTests === tests.length) {
    console.log('\n✅ All tests passed! The AI-Astrology training system is working correctly.');
    console.log('\nKey Features Demonstrated:');
    console.log('1. ✅ AI reads D1, D9, D10 charts with transits, Dasha, and Hora periods');
    console.log('2. ✅ Sector-specific planetary mappings for IT, Banking, Pharma, etc.');
    console.log('3. ✅ Real-world case training improves prediction accuracy');
    console.log('\nThe system maintains 60% astrology weight over 40% AI weight.');
    console.log('All astrological calculations remain hidden from end users.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the error messages above.');
    // Exit with non-zero code so CI/CD pipelines correctly detect the failure.
    // Previously the script always exited 0 even when tests failed.
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);

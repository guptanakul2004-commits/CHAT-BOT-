/**
 * AI Prediction Engine for Stock Analysis
 * Uses technical indicators to make buy/sell/hold recommendations
 */

/**
 * Generate prediction based on technical indicators
 */
exports.predictTrend = (indicators) => {
  const { rsi, macd, sma, currentPrice, highPrice, lowPrice, volume, sentimentScore } = indicators;

  let signals = [];
  let confidence = 50;

  // ═══ RSI Analysis ═══
  if (rsi < 30) {
    signals.push('OVERSOLD');
    confidence += 15;
  } else if (rsi > 70) {
    signals.push('OVERBOUGHT');
    confidence += 15;
  } else if (rsi < 40) {
    signals.push('WEAK');
  } else if (rsi > 60) {
    signals.push('STRONG');
  }

  // ═══ MACD Analysis ═══
  if (macd && macd.MACD && macd.signal) {
    if (macd.MACD > macd.signal) {
      signals.push('MACD_BULLISH');
      confidence += 10;
    } else {
      signals.push('MACD_BEARISH');
    }
  }

  // ═══ Price vs SMA Analysis ═══
  if (sma) {
    if (currentPrice > sma) {
      signals.push('ABOVE_SMA');
      confidence += 8;
    } else {
      signals.push('BELOW_SMA');
    }
  }

  // ═══ Sentiment Analysis ═══
  if (sentimentScore > 65) {
    signals.push('BULLISH_SENTIMENT');
    confidence += 10;
  } else if (sentimentScore < 35) {
    signals.push('BEARISH_SENTIMENT');
  }

  // ═══ Volume Analysis ═══
  if (volume && volume > 1000000) {
    signals.push('HIGH_VOLUME');
    confidence += 5;
  }

  // ═══ Generate Recommendation ═══
  return generateRecommendation(signals, rsi, macd, confidence, sentimentScore);
};

/**
 * Generate AI recommendation from signals
 */
function generateRecommendation(signals, rsi, macd, confidence, sentimentScore) {
  const buySignals = signals.filter(s =>
    ['OVERSOLD', 'MACD_BULLISH', 'ABOVE_SMA', 'BULLISH_SENTIMENT', 'HIGH_VOLUME'].includes(s)
  ).length;

  const sellSignals = signals.filter(s =>
    ['OVERBOUGHT', 'MACD_BEARISH', 'BELOW_SMA', 'BEARISH_SENTIMENT'].includes(s)
  ).length;

  const score = Math.min(99, Math.max(30, confidence));

  // ═══ STRONG BUY ═══
  if (rsi < 30 && macd?.MACD > macd?.signal && buySignals >= 3) {
    return {
      action: 'Strong Buy',
      emoji: '📈',
      confidence: score,
      reason: 'Oversold with bullish reversal signals',
      signals: signals
    };
  }

  // ═══ BUY ═══
  if (buySignals > sellSignals) {
    return {
      action: 'Buy',
      emoji: '📈',
      confidence: Math.min(99, score + 10),
      reason: 'Multiple bullish indicators aligned',
      signals: signals
    };
  }

  // ═══ STRONG SELL ═══
  if (rsi > 70 && macd?.MACD < macd?.signal && sellSignals >= 3) {
    return {
      action: 'Strong Sell',
      emoji: '📉',
      confidence: score,
      reason: 'Overbought with bearish reversal signals',
      signals: signals
    };
  }

  // ═══ SELL ═══
  if (sellSignals > buySignals) {
    return {
      action: 'Sell',
      emoji: '📉',
      confidence: Math.min(99, score + 10),
      reason: 'Multiple bearish indicators aligned',
      signals: signals
    };
  }

  // ═══ HOLD ═══
  return {
    action: 'Hold',
    emoji: '⏸️',
    confidence: score,
    reason: 'Mixed signals - wait for clarity',
    signals: signals
  };
}

/**
 * Get risk assessment
 */
exports.getRiskAssessment = (volatility, volume, price) => {
  let risk = 'MEDIUM';
  let riskScore = 50;

  if (volatility > 5 || volume < 100000) {
    risk = 'HIGH';
    riskScore = 75;
  } else if (volatility < 2 && volume > 1000000) {
    risk = 'LOW';
    riskScore = 25;
  }

  return {
    risk: risk,
    riskScore: riskScore,
    recommendation: risk === 'HIGH' ? 'Invest cautiously' : (risk === 'LOW' ? 'Relatively safe investment' : 'Moderate risk')
  };
};

/**
 * Generate technical analysis summary
 */
exports.generateAnalysisSummary = (ticker, data) => {
  const { rsi, macd, currentPrice, prediction } = data;

  const summary = [
    `📊 Technical Analysis for ${ticker}`,
    `💹 Current Price: $${currentPrice?.toFixed(2) || 'N/A'}`,
    `📈 RSI: ${rsi?.toFixed(2) || 'N/A'} ${rsi < 30 ? '(Oversold)' : rsi > 70 ? '(Overbought)' : '(Neutral)'}`,
    `${prediction?.emoji} Prediction: ${prediction?.action || 'HOLD'}`,
    `🎯 Confidence: ${prediction?.confidence || 50}%`,
    `💡 Reason: ${prediction?.reason || 'Analyzing...'}`
  ];

  return summary.join('\n');
};

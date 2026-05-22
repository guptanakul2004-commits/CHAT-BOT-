const express = require('express');
const YahooFinance = require('yahoo-finance2').default;
const {
  RSI,
  SMA,
  EMA,
  MACD,
  BollingerBands,
} = require('technicalindicators');

const sentimentService = require('../services/sentimentService');
const predictionService = require('../services/predictionService');

const router = express.Router();
const yahooFinance = new YahooFinance();

function lastValue(values) {
  return values.length ? values[values.length - 1] : null;
}

function round(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(digits));
}

function cleanNumbers(values) {
  return values.filter(value => Number.isFinite(value));
}

function tickerCandidates(ticker) {
  const normalized = ticker.toUpperCase();
  if (normalized.includes('.')) return [normalized];
  return [normalized, `${normalized}.NS`, `${normalized}.BO`];
}

async function quoteWithFallback(ticker) {
  let lastError;

  for (const candidate of tickerCandidates(ticker)) {
    try {
      return {
        ticker: candidate,
        quote: await yahooFinance.quote(candidate),
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

async function chartWithFallback(ticker, options) {
  let lastError;

  for (const candidate of tickerCandidates(ticker)) {
    try {
      return {
        ticker: candidate,
        chart: await yahooFinance.chart(candidate, options),
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

// GET /api/stocks/AAPL
router.get('/:ticker', async (req, res) => {
  try {
    const requestedTicker = req.params.ticker.toUpperCase();
    const { ticker, quote } = await quoteWithFallback(requestedTicker);

    res.json({
      symbol: quote.symbol,
      requestedSymbol: requestedTicker,
      resolvedSymbol: ticker,
      name: quote.shortName,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      marketCap: quote.marketCap,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// GET /api/stocks/AAPL/analysis
router.get('/:ticker/analysis', async (req, res) => {
  try {
    const requestedTicker = req.params.ticker.toUpperCase();

    const [{ ticker, quote }, chartResult] = await Promise.all([
      quoteWithFallback(requestedTicker),
      chartWithFallback(requestedTicker, {
        period1: '2024-01-01',
        interval: '1d',
      }),
    ]);

    const chart = chartResult.chart;
    const news = await sentimentService.fetchTickerNews(ticker);

    const quotes = chart.quotes || [];
    const closes = cleanNumbers(quotes.map(q => q.close));
    const highs = cleanNumbers(quotes.map(q => q.high));
    const lows = cleanNumbers(quotes.map(q => q.low));
    const volumes = cleanNumbers(quotes.map(q => q.volume));

    if (closes.length < 50) {
      return res.status(422).json({
        success: false,
        error: 'Not enough market data for analysis',
      });
    }

    const rsi = RSI.calculate({ values: closes, period: 14 });
    const sma20 = SMA.calculate({ values: closes, period: 20 });
    const sma50 = SMA.calculate({ values: closes, period: 50 });
    const ema12 = EMA.calculate({ values: closes, period: 12 });
    const ema20 = EMA.calculate({ values: closes, period: 20 });
    const macd = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const bollingerBands = BollingerBands.calculate({
      values: closes,
      period: 20,
      stdDev: 2,
    });

    const currentPrice = quote.regularMarketPrice || lastValue(closes);
    const latestRsi = lastValue(rsi);
    const latestSma20 = lastValue(sma20);
    const latestMacd = lastValue(macd) || {};
    const latestBands = lastValue(bollingerBands) || {};
    const latestVolume = lastValue(volumes);

    const sentimentHeadlines =
      news.articles?.map(article => article.title).filter(Boolean) || [];
    const sentimentScore = sentimentService.getSentimentScore(sentimentHeadlines);

    const prediction = predictionService.predictTrend({
      rsi: latestRsi,
      macd: latestMacd,
      sma: latestSma20,
      currentPrice,
      highPrice: lastValue(highs),
      lowPrice: lastValue(lows),
      volume: latestVolume,
      sentimentScore,
    });

    const recentHigh = Math.max(...highs.slice(-30));
    const recentLow = Math.min(...lows.slice(-30));
    const volatility =
      currentPrice ? ((recentHigh - recentLow) / currentPrice) * 100 : 0;
    const risk = predictionService.getRiskAssessment(
      volatility,
      latestVolume,
      currentPrice
    );

    res.json({
      success: true,
      ticker,
      requestedTicker,
      name: quote.shortName || quote.longName || ticker,
      currentPrice: round(currentPrice),
      dayChange: round(quote.regularMarketChange),
      dayChangePercent: round(quote.regularMarketChangePercent),
      indicators: {
        rsi: round(latestRsi, 2),
        sma: {
          sma20: round(latestSma20),
          sma50: round(lastValue(sma50)),
        },
        ema: {
          ema12: round(lastValue(ema12)),
          ema20: round(lastValue(ema20)),
        },
        macd: {
          value: round(latestMacd.MACD, 4),
          signal: round(latestMacd.signal, 4),
          histogram: round(latestMacd.histogram, 4),
        },
        bollingerBands: {
          upper: round(latestBands.upper),
          middle: round(latestBands.middle),
          lower: round(latestBands.lower),
        },
      },
      sentiment: news.analysis,
      prediction,
      risk,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/stocks/AAPL/chart?period=3mo
router.get('/:ticker/chart', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const period = req.query.period || '3mo';
    const { chart: result } = await chartWithFallback(ticker, {
      period1: '2024-01-01',
      interval: '1d',
      range: period,
    });

    const chartData = result.quotes.map(q => ({
      date: q.date,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
    }));

    res.json(chartData);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// GET /api/stocks/AAPL/compare/MSFT
router.get('/:ticker1/compare/:ticker2', async (req, res) => {
  try {
    const { ticker1, ticker2 } = req.params;
    const [stock1Result, stock2Result] = await Promise.all([
      quoteWithFallback(ticker1),
      quoteWithFallback(ticker2),
    ]);
    const stock1 = stock1Result.quote;
    const stock2 = stock2Result.quote;

    res.json({
      stock1: {
        symbol: stock1.symbol,
        resolvedSymbol: stock1Result.ticker,
        price: stock1.regularMarketPrice,
        marketCap: stock1.marketCap,
      },
      stock2: {
        symbol: stock2.symbol,
        resolvedSymbol: stock2Result.ticker,
        price: stock2.regularMarketPrice,
        marketCap: stock2.marketCap,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;

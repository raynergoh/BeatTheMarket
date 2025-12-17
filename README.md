# BeatTheMarket

<div align="center">
  <img src="public/images/app/logo-full-custom.png" alt="BeatTheMarket Logo" width="400" />
  <p><em>Stop guessing. Start measuring. True portfolio alpha tracking for Interactive Brokers users.</em></p>
  <p><strong><a href="https://beat-the-market-ten.vercel.app/">View Live Demo / Use App</a></strong></p>
</div>

<div align="center">
  <p>
    <a href="#key-features">Key Features</a> •
    <a href="#why-beatthemarket">Why BeatTheMarket</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#future-roadmap">Roadmap</a> •
    <a href="#getting-started">Getting Started</a>
  </p>
</div>

---

## Overview

<div align="center">
  <img src="public/images/readme/dashboard-overview.png" alt="Dashboard Overview" width="100%" />
</div>

<br />

## Why BeatTheMarket?

Most brokerage platforms (including Interactive Brokers) are great at executing trades but terrible at showing you your **true performance**.

1.  **The "Deposits = Profit" Fallacy**: Many simple trackers confuse a fresh deposit with investment gain.
2.  **Time-Weighted vs. Money-Weighted**: Brokers often show TWR (Time-Weighted Return), which is great for fund managers but irrelevant for individuals who control *when* they deploy cash. If you buy the dip and the market rallies, your personal return (MWR) is higher than the fund's return. **BeatTheMarket calculates your true Money-Weighted Return.**
3.  **The "Ghost Portfolio" Benchmark**: It's easy to say "I'm up 10% this year". But if the S&P 500 is up 15%, you effectively *lost* money by picking stocks. BeatTheMarket creates a **Ghost Portfolio** that simulates "What if I had invested every single dollar of my deposits into the S&P 500 (or other benchmark) on the exact same day I deposited it?" This is the only way to measure true **Alpha**.

## Key Features

- **True MWR Calculation**: Uses the **Modified Dietz** method and **XIRR** to calculate your exact personal performance, accounting for the timing and size of every deposit and withdrawal.
- **"Ghost" Benchmarking**: Compares your portfolio against a simulated benchmark strategy (e.g., S&P 500, Nasdaq, World Index) using identical cash flows.
- **Privacy First**: All data processing happens **locally in your browser**. Your financial data (IBKR Flex Queries) is parsed client-side. No sensitive portfolio data is stored on our servers.
- **Deep Diversification Analysis**:
    - **Sector Breakdown**: See your exposure to Tech, Healthcare, etc.
    - **Geographic Breakdown**: Visualise your global exposure.
    - **Asset Class**: Equity, Cash, Options, etc.
- **Multi-Currency Logic**: View your portfolio in **USD**, **SGD**, **EUR**, or **GBP**. Automatically handles currency conversions for accurate Net Worth and Performance tracking, with granular cash reporting.
- **Mobile-Responsive Design**: Fully optimized for mobile devices, tablets, and desktops. Check your Alpha on the go with a clean, compact interface.

## How It Works

BeatTheMarket is capable of ingesting data directly from **Interactive Brokers** via **Flex Queries**.

1.  **Ingestion**: You generate a specific XML Flex Query in IBKR (containing Cash Transactions and Open Positions).
2.  **Parsing (Client-Side)**: The app parses complex XML structures, handling spin-offs, dividends, tax withholding, and currency conversions.
3.  **Math Engine**:
    -   We aggregate strictly by **Cash Flows** (Net Deposits). 
    -   **Daily Valuation**: We interpolate portfolio values between data points to generate smooth charts.
    -   **Alpha Generation**: `Alpha = Portfolio MWR - Benchmark MWR`.
4.  **Tech Stack**:
    -   **Framework**: Next.js 16 (App Router)
    -   **UI**: React 19, Tailwind CSS 4, Shadcn/UI (Radix Primitives)
    -   **Charts**: Recharts
    -   **State Management**: Zustand
    -   **Math**: `xirr` library + custom financial calculation engine.

## Future Roadmap

We are consistently shipping updates. Our priority is **Broker Expansion** → **Deep Analytics** → **Ecosystem**.

### 1. Broker Expansion (High Priority)
*   **Tiger Brokers**: Full support for Tiger's data export format.
*   **Moomoo**: Integration with Moomoo's portfolio export.
*   **Webull**: Support for Webull users.
*   **CSV Import**: Generic adapter for custom data import from any source.

> **Note**: Our architecture has been refactored with a modular provider-based system, making it straightforward to add new broker integrations.

### 2. Advanced Analytics
*   **Dividend Intelligence**: Calendar view, Yield on Cost tracking, and Dividend Growth visualizations.
*   **Risk-Adjusted Returns**: Sharpe Ratio, Sortino Ratio, and Max Drawdown stats to see if your Alpha is worth the risk.
*   **Per-Position Alpha**: Calculate the exact MWR for each individual holding and compare it to a "Ghost Position" of the benchmark bought at the same times. See exactly which stocks contributed to your outperformance.
*   **Custom Benchmarking**: Compare against any ticker (QQQ, ARKK, BRK.B), not just indices.

### 3. Ecosystem & Insights
*   **Fundamental Data Overlay**: P/E, PEG, and Earnings dates on your holdings.
*   **Anonymous Peer Comparison**: See how your Alpha percentile ranks against other users (opt-in).
*   **PWA Support**: Install BeatTheMarket as a Progressive Web App for offline access.

## Getting Started

### Use the Hosted App
The easiest way to use BeatTheMarket is to visit our live deployment:
👉 **[beat-the-market-ten.vercel.app](https://beat-the-market-ten.vercel.app/)**

### Run Locally
If you prefer to run the code yourself:

1.  **Clone the repository**
    ```bash
    git clone https://github.com/raynergoh/BeatTheMarket.git
    ```
2.  **Install dependencies**
    ```bash
    npm install
    ```
3.  **Run the development server**
    ```bash
    npm run dev
    ```
4.  **Open your browser**
    Navigate to [http://localhost:3000](http://localhost:3000)

---
*Built with ❤️ for investors who care about the numbers.*

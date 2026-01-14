/*
  # Trading Tracker Database Schema

  1. New Tables
    - `trades`
      - `id` (uuid, primary key) - Unique identifier for each trade
      - `created_at` (timestamptz) - Timestamp when trade was recorded
      - `trade_date` (date) - Date when trade was executed
      - `description` (text) - Description of the trade
      - `multiplier` (numeric) - Odds/multiplier (e.g., 2.5, 3.0)
      - `stake` (numeric) - Position size/stake amount
      - `outcome` (text) - 'win' or 'loss'
      - `profit_loss` (numeric) - Calculated profit or loss amount
      - `amount_banked` (numeric) - 30% of profit added to bank (0 for losses)
      - `roll_pot_after` (numeric) - Running Roll Pot balance after trade
      - `bank_total_after` (numeric) - Running Bank Total after trade
      - `total_wealth_after` (numeric) - Running Total Wealth after trade
      - `trade_number` (integer) - Sequential trade number

  2. Security
    - Enable RLS on `trades` table
    - Add policies for public access (since no auth is mentioned)
    
  3. Notes
    - All numeric fields use numeric type for precision with money
    - Trade calculations are stored as history
    - Sequential trade numbering for easy reference
*/

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  trade_date date NOT NULL,
  description text NOT NULL,
  multiplier numeric(10,2) NOT NULL,
  stake numeric(10,2) NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('win', 'loss')),
  profit_loss numeric(10,2) NOT NULL DEFAULT 0,
  amount_banked numeric(10,2) NOT NULL DEFAULT 0,
  roll_pot_after numeric(10,2) NOT NULL,
  bank_total_after numeric(10,2) NOT NULL,
  total_wealth_after numeric(10,2) NOT NULL,
  trade_number integer NOT NULL
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to trades"
  ON trades
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public insert access to trades"
  ON trades
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to trades"
  ON trades
  FOR DELETE
  TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS trades_trade_number_idx ON trades(trade_number DESC);
CREATE INDEX IF NOT EXISTS trades_created_at_idx ON trades(created_at DESC);
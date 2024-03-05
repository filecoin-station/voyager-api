CREATE TABLE meridian_contract_versions (
  -- 0x of f4 address of the MERidian smart contract emitting "round started" events
  -- We are using TEXT instead of BYTEA for simplicity
  contract_address TEXT NOT NULL PRIMARY KEY,
  -- The first Voyager round governed by this smart contract is calculated as
  --   voyager_round = meridian_round + voyager_round_offset
  -- The offset is usually negative for the first row and positive for other rows
  voyager_round_offset BIGINT NOT NULL,
  -- The last Voyager round governed by this smart contract
  last_voyager_round_number BIGINT NOT NULL
);

CREATE TABLE voyager_rounds (
  -- Voyager round number
  id BIGINT NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL
);

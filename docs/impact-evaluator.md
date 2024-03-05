# Impact Evaluator

After deploying a new version of the [`voyager-impact-evaluator`](https://github.com/filecoin-station/voyager-impact-evaluator),
update the services mentioned in this document.

## contract

- Add address to https://www.notion.so/pl-strflt/Addresses-c1140fd90af94388a9bfbd4f4da2a377#5dda4b1708054349af91fa356e58b950
- Replace CLI contract address
- Send FIL rewards to the contract

## Telemetry

- Replace `0x` and `f4` contract addresses https://github.com/filecoin-station/telegraf/blob/main/telegraf.conf
- Test your changes with `telegraf --config telegraf.conf --test`
- Push to `main` to deploy

## `voyager-evaluate`

- Replace `0x` contract address https://github.com/filecoin-station/voyager-evaluate/blob/main/lib/config.js
- Replace ABI https://github.com/filecoin-station/voyager-evaluate/blob/main/lib/abi.json
- Push to `main` to deploy

## `voyager-api`

- Replace `0x` contract address https://github.com/filecoin-station/voyager-api/blob/main/voyager-publish/ie-contract-config.js
- Replace ABI https://github.com/filecoin-station/voyager-api/blob/main/voyager-publish/abi.json
- Push to `main` to deploy

## `site-backend`

- Replace `0x` contract address https://github.com/filecoin-station/site-backend/blob/main/lib/getFilEarned.ts
- Test your changes
- Push to `main` to deploy

## Station Desktop

- Replace ABI `abi.json`

## Station Core

- Replace `0x` contract address
- Replace ABI `abi.json`

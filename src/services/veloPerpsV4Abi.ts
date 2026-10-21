// Generated from the compiled VeloPerpsV4 artifact.
export const VELO_PERPS_V4_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "usdc",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "pyth",
        "type": "address",
        "internalType": "contract IPythV2"
      },
      {
        "name": "initialOwner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "initialGuardian",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "CLOSE_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KEEPER_BOUNTY_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_LEVERAGE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_COLLATERAL_USDC_6",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_HOLD_SECONDS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OPEN_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PYTH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPythV2"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PYTH_MAX_AGE_SECONDS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "USDC",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VERSION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "accountSurplus",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "accountedBalance",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activeOrderCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "availableLiquidity",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelConditionalOrder",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "closeIfTriggered",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "updateData",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "closePosition",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "priceLimit",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "deadline",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "updateData",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "collateralEscrow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "conditionalOrders",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "pairIndex",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "isLong",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "leverage",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "marginMode",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "triggerKind",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "reduceOnly",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "reduceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "collateralUSDC_6",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "triggerPrice_E18",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "createdAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "entriesPaused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeConditionalOrder",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "updateData",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "feeBalance",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fundPool",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPosition",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct VeloPerpsV4.Position",
        "components": [
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "pairIndex",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "isLong",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "leverage",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "marginMode",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "collateralUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "entryPrice_E18",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "openedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "takeProfit_E18",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "stopLoss_E18",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "originalNotional_6",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTraderOrders",
    "inputs": [
      {
        "name": "trader",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTraderTrades",
    "inputs": [
      {
        "name": "trader",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "guardian",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastPublishTime",
    "inputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liquidate",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "updateData",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "liquidationCheck",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "mark",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "marketRisk",
    "inputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "maxPositionUSDC_6",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxOpenInterestUSDC_6",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxBlockVolumeUSDC_6",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxLeverage",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maintenanceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maxConfidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "borrowBpsPerHour",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextOrderId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextTradeId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openInterest",
    "inputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openPosition",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct VeloPerpsV4.OpenParams",
        "components": [
          {
            "name": "pairIndex",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "isLong",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "collateralUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "leverage",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "takeProfit_E18",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "stopLoss_E18",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "priceLimit_E18",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      },
      {
        "name": "updateData",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "openPositionCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "orderEscrow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "orderTerms",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "pairIndex",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "isLong",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "collateralUSDC_6",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "leverage",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "takeProfit_E18",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "stopLoss_E18",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "priceLimit_E18",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "deadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pairFeedId",
    "inputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pairLabel",
    "inputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pairTradable",
    "inputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOrderCount",
    "inputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "placeConditionalOrder",
    "inputs": [
      {
        "name": "request",
        "type": "tuple",
        "internalType": "struct VeloPerpsV4.OrderParams",
        "components": [
          {
            "name": "position",
            "type": "tuple",
            "internalType": "struct VeloPerpsV4.OpenParams",
            "components": [
              {
                "name": "pairIndex",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "isLong",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "collateralUSDC_6",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "leverage",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "takeProfit_E18",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "stopLoss_E18",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "priceLimit_E18",
                "type": "uint128",
                "internalType": "uint128"
              },
              {
                "name": "deadline",
                "type": "uint64",
                "internalType": "uint64"
              }
            ]
          },
          {
            "name": "triggerKind",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "triggerPrice_E18",
            "type": "uint128",
            "internalType": "uint128"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "poolAssets",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolBalance",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "positionOpenFee",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "positions",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "pairIndex",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "isLong",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "leverage",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "marginMode",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "collateralUSDC_6",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "entryPrice_E18",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "openedAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "takeProfit_E18",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "stopLoss_E18",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "originalNotional_6",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteClose",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "mark",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "keeper",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [
      {
        "name": "s",
        "type": "tuple",
        "internalType": "struct VeloPerpsV4.Settlement",
        "components": [
          {
            "name": "price",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "pnl",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "payout",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "fee",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "bounty",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "borrowFee",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerPair",
    "inputs": [
      {
        "name": "id",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "feed",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "label",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "risk",
        "type": "tuple",
        "internalType": "struct VeloPerpsV4.MarketRisk",
        "components": [
          {
            "name": "maxPositionUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxOpenInterestUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxBlockVolumeUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxLeverage",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maintenanceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxConfidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "borrowBpsPerHour",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registeredFeed",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reservedProfit",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setEntriesPaused",
    "inputs": [
      {
        "name": "paused",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setGuardian",
    "inputs": [
      {
        "name": "nextGuardian",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMarketRisk",
    "inputs": [
      {
        "name": "id",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "risk",
        "type": "tuple",
        "internalType": "struct VeloPerpsV4.MarketRisk",
        "components": [
          {
            "name": "maxPositionUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxOpenInterestUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxBlockVolumeUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxLeverage",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maintenanceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxConfidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "borrowBpsPerHour",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPairTradable",
    "inputs": [
      {
        "name": "id",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "tradable",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTriggers",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "takeProfit",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "stopLoss",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawFees",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawLiquidity",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ConditionalOrderCancelled",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "trader",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConditionalOrderExecuted",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "trader",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "linkedTradeId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "markPrice_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConditionalOrderPlaced",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "trader",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "pairIndex",
        "type": "uint16",
        "indexed": true,
        "internalType": "uint16"
      },
      {
        "name": "isLong",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "triggerKind",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "marginMode",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "reduceOnly",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "reduceBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "triggerPrice_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "collateralUSDC_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "leverage",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "EntriesPaused",
    "inputs": [
      {
        "name": "paused",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeesWithdrawn",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amountUSDC_6",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GuardianSet",
    "inputs": [
      {
        "name": "guardian",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LiquidityAdded",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amountUSDC_6",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LiquidityWithdrawn",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amountUSDC_6",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketRiskSet",
    "inputs": [
      {
        "name": "pairIndex",
        "type": "uint16",
        "indexed": true,
        "internalType": "uint16"
      },
      {
        "name": "risk",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct VeloPerpsV4.MarketRisk",
        "components": [
          {
            "name": "maxPositionUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxOpenInterestUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxBlockVolumeUSDC_6",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxLeverage",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maintenanceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxConfidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "borrowBpsPerHour",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferStarted",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PairRegistered",
    "inputs": [
      {
        "name": "pairIndex",
        "type": "uint16",
        "indexed": true,
        "internalType": "uint16"
      },
      {
        "name": "feedId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "label",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PairTradable",
    "inputs": [
      {
        "name": "pairIndex",
        "type": "uint16",
        "indexed": true,
        "internalType": "uint16"
      },
      {
        "name": "tradable",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PositionClosed",
    "inputs": [
      {
        "name": "tradeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "trader",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "pairIndex",
        "type": "uint16",
        "indexed": true,
        "internalType": "uint16"
      },
      {
        "name": "exitPrice_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "pnlUSDC_6",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "payoutUSDC_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "feeUSDC_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PositionLiquidated",
    "inputs": [
      {
        "name": "tradeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "trader",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "liquidator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "exitPrice_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "bountyUSDC_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PositionOpened",
    "inputs": [
      {
        "name": "tradeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "trader",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "pairIndex",
        "type": "uint16",
        "indexed": true,
        "internalType": "uint16"
      },
      {
        "name": "isLong",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "leverage",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "marginMode",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "collateralUSDC_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "entryPrice_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SettlementFees",
    "inputs": [
      {
        "name": "tradeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "borrowFeeUSDC_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "keeperBountyUSDC_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TriggerFired",
    "inputs": [
      {
        "name": "tradeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "trader",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "keeper",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "wasTakeProfit",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "exitPrice_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "keeperBounty_6",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TriggersSet",
    "inputs": [
      {
        "name": "tradeId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "takeProfit_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      },
      {
        "name": "stopLoss_E18",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccountingMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AddressInsufficientBalance",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedInnerCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientLiquidity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInput",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MarketUnavailable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MathOverflowedMulDiv",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAuthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotLiquidatable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OracleFeeMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OracleInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PriceLimit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RiskLimit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TooEarly",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TriggerNotHit",
    "inputs": []
  }
] as const;

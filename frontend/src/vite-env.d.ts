/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STATE_FILE_URL: string
  readonly VITE_BITTENSOR_ENDPOINT: string
  readonly VITE_PROTOCOL_COLDKEY: string
  readonly VITE_PROTOCOL_HOTKEY: string
  readonly VITE_SUBNET_ID: string
  readonly VITE_PROTOCOL_REMARK_TAG: string
  readonly VITE_MARKET_DATA_REFRESH: string
  readonly VITE_ALPHA_PRICE_REFRESH: string
  readonly VITE_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

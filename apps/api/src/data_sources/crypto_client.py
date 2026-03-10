from pycoingecko import CoinGeckoAPI
from typing import Optional

_cg = CoinGeckoAPI()


def get_crypto_price(coin_id: str, currency: str = "jpy") -> Optional[float]:
    try:
        data = _cg.get_price(ids=coin_id, vs_currencies=currency)
        return float(data[coin_id][currency])
    except Exception:
        return None

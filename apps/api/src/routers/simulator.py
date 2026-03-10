from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from ..config.settings import settings
from ..core.simulator import MonteCarloSimulator

router = APIRouter(prefix="/simulator", tags=["simulator"])


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")


class SimulatorRequest(BaseModel):
    initial_amount: float = 1_000_000
    monthly_investment: float = 50_000
    years: int = 20
    expected_return: float = 0.05
    volatility: float = 0.15
    simulations: int = 1000


@router.post("/run")
def run_simulator(req: SimulatorRequest, _: None = Depends(verify_api_key)) -> dict:
    sim = MonteCarloSimulator()
    result = sim.run(
        initial_amount=req.initial_amount,
        monthly_investment=req.monthly_investment,
        years=req.years,
        expected_return=req.expected_return,
        volatility=req.volatility,
        simulations=req.simulations,
    )
    return {
        "years": result.years,
        "year_labels": result.year_labels,
        "percentiles": result.percentiles,
        "final_values": result.final_values,
    }

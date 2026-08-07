export function formatCountryRiskPremiumBp(countryRiskPremiumBp: number): string {
  if (!Number.isFinite(countryRiskPremiumBp) || countryRiskPremiumBp < 0) {
    throw new RangeError("CRP non valido: atteso un numero finito e non negativo.");
  }

  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(countryRiskPremiumBp / 100) + "%";
}

export function formatBasisPoints(valueBp: number): string {
  if (!Number.isFinite(valueBp) || valueBp < 0) {
    throw new RangeError("Valore in basis point non valido.");
  }
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(valueBp)} bp`;
}

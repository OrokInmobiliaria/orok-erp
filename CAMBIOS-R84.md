# R84 · Evaluador: impuesto predial año por año con la HR/PU (67.6.71-r84)

- Nuevo cálculo del predial según la situación al 1 de enero de cada año (D. Leg. 776):
  1. Mientras exista la casa: terreno (área × arancel) + construcción existente, como en la HR/PU.
  2. Desde la demolición hasta la independización: solo terreno.
  3. Desde el 1 de enero siguiente a la independización: solo las unidades que la empresa aún no vendió (valor de obra oficial + terreno, prorrateado); lo vendido lo paga el comprador.
- Tramos 0.2% / 0.6% / 1% sobre la suma de predios del contribuyente; mínimo 0.6% UIT. El primer año se prorratea por cuotas trimestrales pendientes.
- La línea «Impuesto predial» de Costos inmobiliarios usa este total y se paga en febrero de cada año (si su forma de pago es «proyecto»).
- Tributarios: año de la HR/PU, arancel del terreno, valor de la construcción existente, mes de demolición, alza anual de arancel y UIT. Arancel 0 = método anterior.
- Infinity 224 toma los datos de la HR/PU 2026 de San Miguel: terreno 160 m² × S/ 396 = S/ 63,360; construcción existente S/ 135,478.68; autovalúo S/ 198,838.68; predial 2026 S/ 863.03 (cuadra con la HR).
- No se guardan datos personales del contribuyente.

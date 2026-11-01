# R94 · Evaluador: gastos generales tomados del detalle (67.6.81-r94)

- Los gastos generales del costo de construcción ahora salen de **07 · Gastos generales** (staff, oficina, pólizas, cartas fianza, etc.), ya no de un % fijo.
- Fórmula (válida para todos los proyectos): costo directo = partidas (S/ por m² × área total); GG = montos fijos del detalle + sus % sobre el presupuesto de obra; subtotal = (CD + GG) / (1 − utilidad). El costo total por m² se deriva de ahí.
- Si cambias el detalle de GG (por ejemplo, más meses de obra o un sueldo), el costo de construcción y el costo por m² se actualizan solos.
- Si escribes directamente el costo total por m², el Evaluador ajusta el costo directo para llegar a ese valor (con el GG del detalle).
- Se retira el campo «GG implícito (% CD)». En 07 · Gastos generales se ve cuánto entra al costo y su % del CD.

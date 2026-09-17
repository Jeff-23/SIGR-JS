# Fix 48D-2D v5 — espera de convergencia completa

Corrige únicamente el certificador. El ciclo anterior terminaba la espera EDGE->CLOUD en cuanto convergía el saldo de puntos, aunque el evento de consentimiento pudiera estar aún pendiente en el siguiente ciclo.

Ahora la fase 4 espera simultáneamente cliente, saldo, movimiento inicial y consentimiento WhatsApp; la fase 8 espera saldo, dos movimientos, revocación del consentimiento y actualización del teléfono. También verifica que el reenvío no duplique el consentimiento.

No requiere rebuild de Docker ni migraciones.

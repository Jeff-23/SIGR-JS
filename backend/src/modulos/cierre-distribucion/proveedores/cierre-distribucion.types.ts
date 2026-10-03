export type ArchivoDistribucion = {
  nombre: string;
  mime: string;
  contenido: Buffer;
};

export type MensajeDistribucion = {
  destino: string;
  asunto: string;
  texto: string;
  archivos: ArchivoDistribucion[];
};

export type ResultadoEnvio = {
  referencia?: string;
};

export interface ProveedorEmailCierre {
  disponible(): boolean;
  enviar(mensaje: MensajeDistribucion): Promise<ResultadoEnvio>;
}

export interface ProveedorWhatsAppCierre {
  disponible(): boolean;
  enviar(mensaje: MensajeDistribucion): Promise<ResultadoEnvio>;
}

import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f7f5ee",
        color: "#243732",
        fontFamily: "Georgia, serif",
        padding: 56,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          border: "2px solid #d8d2c3",
          borderRadius: 24,
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            width: 420,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "#1f332d",
            color: "#f4efe1",
            padding: 48,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 74,
                height: 74,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "3px solid #f4efe1",
                borderRadius: 14,
                background: "#f4efe1",
                color: "#1f332d",
                fontFamily: "Arial, sans-serif",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 1.8,
              }}
            >
              FISI
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  color: "#d6b35e",
                  fontFamily: "Arial, sans-serif",
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: 5,
                }}
              >
                UNMSM
              </div>
              <div style={{ fontSize: 34, fontWeight: 700 }}>Horarios</div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontFamily: "Arial, sans-serif",
              fontSize: 24,
              color: "rgba(244,239,225,0.78)",
            }}
          >
            <div>Docentes</div>
            <div>Dirección Académica</div>
            <div>Semestre 2026.2</div>
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 28,
            padding: "52px 64px",
          }}
        >
          <div
            style={{
              color: "#b99540",
              fontFamily: "Arial, sans-serif",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 4,
            }}
          >
            FISI UNMSM
          </div>
          <div
            style={{
              maxWidth: 610,
              fontSize: 70,
              fontWeight: 700,
              lineHeight: 0.98,
            }}
          >
            Registro académico de disponibilidad docente
          </div>
          <div
            style={{
              maxWidth: 620,
              color: "#5f6964",
              fontFamily: "Arial, sans-serif",
              fontSize: 28,
              lineHeight: 1.35,
            }}
          >
            Acceso institucional para registrar, revisar y cerrar horarios del
            semestre vigente.
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}

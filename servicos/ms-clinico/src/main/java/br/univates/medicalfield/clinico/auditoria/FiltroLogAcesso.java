package br.univates.medicalfield.clinico.auditoria;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Middleware de log de acesso exigido pelo enunciado: registra toda requisição HTTP com data/hora,
 * IP do cliente, ID do profissional, método, rota, status e tempo (ms). Fica em volta de toda a
 * cadeia (inclusive da autenticação) e grava depois da resposta, sem atrasá-la.
 */
public class FiltroLogAcesso extends OncePerRequestFilter {

    public static final String ATRIBUTO_PROFISSIONAL_ID = "medicalfield.profissionalIdParaLog";
    private static final Pattern FORMATO_UUID =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final RegistradorDeAcessos registrador;

    public FiltroLogAcesso(RegistradorDeAcessos registrador) {
        this.registrador = registrador;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest requisicao, HttpServletResponse resposta, FilterChain cadeia)
            throws ServletException, IOException {
        Instant dataHora = Instant.now();
        long inicio = System.nanoTime();
        boolean falhou = false;
        try {
            cadeia.doFilter(requisicao, resposta);
        } catch (IOException | ServletException | RuntimeException e) {
            falhou = true;
            throw e;
        } finally {
            int tempoMs = (int) ((System.nanoTime() - inicio) / 1_000_000);
            String dispositivo = requisicao.getHeader("X-Dispositivo-Id");
            registrador.registrar(new LogAcesso(
                    dataHora,
                    ipDoCliente(requisicao),
                    (UUID) requisicao.getAttribute(ATRIBUTO_PROFISSIONAL_ID),
                    requisicao.getMethod(),
                    cortar(requisicao.getRequestURI(), 500),
                    falhou ? 500 : resposta.getStatus(),
                    tempoMs,
                    dispositivo != null && FORMATO_UUID.matcher(dispositivo.strip()).matches()
                            ? UUID.fromString(dispositivo.strip()) : null,
                    cortar(requisicao.getHeader("User-Agent"), 300)));
        }
    }

    /**
     * O Nginx preenche X-Real-IP com o IP de quem chamou. O serviço não fica exposto fora da
     * rede do Docker, então esse cabeçalho é confiável aqui.
     */
    private static String ipDoCliente(HttpServletRequest requisicao) {
        String ipReal = requisicao.getHeader("X-Real-IP");
        return ipReal != null && !ipReal.isBlank() ? ipReal.strip() : requisicao.getRemoteAddr();
    }

    private static String cortar(String texto, int limite) {
        if (texto == null) {
            return null;
        }
        return texto.length() <= limite ? texto : texto.substring(0, limite);
    }
}

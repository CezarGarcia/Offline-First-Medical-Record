package br.univates.medicalfield.clinico.seguranca;

import br.univates.medicalfield.clinico.auditoria.FiltroLogAcesso;
import br.univates.medicalfield.clinico.erros.ErroApi;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/**
 * Exige um token de acesso válido em TODA rota do ms-clinico (D-19): este serviço não tem
 * nenhuma rota pública. Roda depois do log de acesso, para ele medir também a autenticação.
 */
public class FiltroAutenticacao extends OncePerRequestFilter {

    public static final String ATRIBUTO_PROFISSIONAL = "medicalfield.profissional";

    private final LeitorDeToken leitor;
    private final ObjectMapper json;

    public FiltroAutenticacao(LeitorDeToken leitor, ObjectMapper json) {
        this.leitor = leitor;
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest requisicao, HttpServletResponse resposta, FilterChain cadeia)
            throws ServletException, IOException {
        String cabecalho = requisicao.getHeader("Authorization");
        if (cabecalho == null || !cabecalho.regionMatches(true, 0, "Bearer ", 0, 7)) {
            recusar(resposta);
            return;
        }
        ProfissionalAutenticado profissional;
        try {
            profissional = leitor.ler(cabecalho.substring(7).strip());
        } catch (Exception e) {
            recusar(resposta);
            return;
        }
        requisicao.setAttribute(ATRIBUTO_PROFISSIONAL, profissional);
        requisicao.setAttribute(FiltroLogAcesso.ATRIBUTO_PROFISSIONAL_ID, profissional.id());
        cadeia.doFilter(requisicao, resposta);
    }

    private void recusar(HttpServletResponse resposta) throws IOException {
        ErroApi erro = ErroApi.naoAutenticado();
        resposta.setStatus(erro.status().value());
        resposta.setContentType(MediaType.APPLICATION_JSON_VALUE);
        resposta.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resposta.getWriter().write(json.writeValueAsString(erro.corpo()));
    }
}

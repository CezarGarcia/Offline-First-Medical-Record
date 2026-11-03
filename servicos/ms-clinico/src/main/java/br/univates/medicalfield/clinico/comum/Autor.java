package br.univates.medicalfield.clinico.comum;

import br.univates.medicalfield.clinico.seguranca.FiltroAutenticacao;
import br.univates.medicalfield.clinico.seguranca.ProfissionalAutenticado;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

/** Quem está enviando a requisição: o profissional do token e o dispositivo dos cabeçalhos. */
public record Autor(ProfissionalAutenticado profissional, UUID dispositivoId, String dispositivoNome) {

    public static Autor de(HttpServletRequest requisicao) {
        ProfissionalAutenticado profissional =
                (ProfissionalAutenticado) requisicao.getAttribute(FiltroAutenticacao.ATRIBUTO_PROFISSIONAL);
        return new Autor(
                profissional,
                uuidOuNulo(requisicao.getHeader("X-Dispositivo-Id")),
                Banco.limpar(decodificado(requisicao.getHeader("X-Dispositivo-Nome"))));
    }

    /**
     * O app cliente manda o nome codificado como num endereço ("Ambul%C3%A2ncia%2001"), porque um cabeçalho
     * HTTP só aceita ASCII. Um nome sem codificação (ex.: pelo Postman) passa como veio.
     */
    private static String decodificado(String texto) {
        if (texto == null || texto.indexOf('%') < 0) {
            return texto;
        }
        try {
            return URLDecoder.decode(texto.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return texto;
        }
    }

    /**
     * Usa a origem enviada pelo cliente ou, se ela não veio (ex.: teste pelo Postman), preenche
     * com o profissional do token, a hora atual e o modo ONLINE.
     */
    public Origem origemPara(OrigemEntrada entrada, Instant agora, Verificacao verificacao) {
        if (entrada == null) {
            return new Origem(profissional.id(), profissional.nome(), profissional.registroCompleto(),
                    agora, dispositivoId, dispositivoNome, "ONLINE");
        }
        Instant criadoEm = entrada.criadoEm().toInstant();
        verificacao.naoNoFuturo("origem.criadoEm", criadoEm, agora);
        return new Origem(entrada.criadoPorId(), entrada.criadoPorNome().strip(), entrada.criadoPorRegistro().strip(),
                criadoEm, entrada.dispositivoId(), Banco.limpar(entrada.dispositivoNome()), entrada.modo());
    }

    private static UUID uuidOuNulo(String texto) {
        try {
            return texto == null ? null : UUID.fromString(texto.strip());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

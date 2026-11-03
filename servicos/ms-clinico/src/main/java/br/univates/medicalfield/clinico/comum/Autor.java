package br.univates.medicalfield.clinico.comum;

import br.univates.medicalfield.clinico.seguranca.FiltroAutenticacao;
import br.univates.medicalfield.clinico.seguranca.ProfissionalAutenticado;
import jakarta.servlet.http.HttpServletRequest;
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
                Banco.limpar(requisicao.getHeader("X-Dispositivo-Nome")));
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

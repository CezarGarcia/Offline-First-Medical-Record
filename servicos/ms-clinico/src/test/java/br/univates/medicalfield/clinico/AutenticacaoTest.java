package br.univates.medicalfield.clinico;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.KeyPairGenerator;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Toda rota exige token (D-19) e as rotas de admin conferem o perfil. */
class AutenticacaoTest extends TesteIntegracao {

    @Test
    void semTokenOuComTokenRuimRespondeNaoAutenticado() throws Exception {
        KeyPairGenerator gerador = KeyPairGenerator.getInstance("RSA");
        gerador.initialize(2048);
        UUID alguem = UUID.randomUUID();
        Instant daquiAPouco = Instant.now().plus(5, ChronoUnit.MINUTES);

        List<Map<String, String>> casos = new ArrayList<>();
        casos.add(Map.of());
        casos.add(Map.of("Authorization", "Basic YTpi"));
        casos.add(Map.of("Authorization", "Bearer nao-e-um-jwt"));
        casos.add(Map.of("Authorization", "Bearer " + token(alguem, "ADMIN", daquiAPouco,
                gerador.generateKeyPair().getPrivate(), "medicalfield-auth", "medicalfield")));
        casos.add(Map.of("Authorization", "Bearer " + token(alguem, "ADMIN", Instant.now().minus(5, ChronoUnit.MINUTES),
                CHAVES.getPrivate(), "medicalfield-auth", "medicalfield")));
        casos.add(Map.of("Authorization", "Bearer " + token(alguem, "ADMIN", daquiAPouco, CHAVES.getPrivate(),
                "outro-emissor", "medicalfield")));
        casos.add(Map.of("Authorization", "Bearer " + token(alguem, "ADMIN", daquiAPouco, CHAVES.getPrivate(),
                "medicalfield-auth", "outro-publico")));

        for (Map<String, String> cabecalhos : casos) {
            Resposta r = get("/api/medicamento", null, cabecalhos);
            assertThat(r.status()).as("cabeçalhos %s", cabecalhos.keySet()).isEqualTo(401);
            assertThat(r.erro()).isEqualTo("NAO_AUTENTICADO");
        }
    }

    @Test
    void comTokenValidoAcessa() {
        assertThat(get("/api/medicamento", tokenOperacional()).status()).isEqualTo(200);
    }

    @Test
    void rotaDeAdminConfereOPerfil() {
        Resposta negado = get("/api/conflito", tokenOperacional());
        assertThat(negado.status()).isEqualTo(403);
        assertThat(negado.erro()).isEqualTo("PROIBIDO");
        assertThat(get("/api/conflito", tokenAdmin()).status()).isEqualTo(200);
    }

    @Test
    void especificacaoOpenApiTambemExigeToken() {
        assertThat(get("/api/docs/ms-clinico", null).status()).isEqualTo(401);

        Resposta r = get("/api/docs/ms-clinico", tokenOperacional());
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.corpo().path("openapi").asString()).startsWith("3.");
        List<String> caminhos = new ArrayList<>();
        r.corpo().path("paths").propertyNames().forEach(caminhos::add);
        assertThat(caminhos).contains("/api/medicamento", "/api/pessoa", "/api/prontuario", "/api/prontuario/{id}",
                "/api/atendimento", "/api/atendimento/{id}", "/api/atendimento/detalhe/{id}", "/api/sync/pull",
                "/api/conflito");
    }

    @Test
    void rotaInexistente() {
        assertThat(get("/api/nao-existe", null).status()).isEqualTo(401);
        Resposta r = get("/api/nao-existe", tokenOperacional());
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.erro()).isEqualTo("NAO_ENCONTRADO");
    }
}

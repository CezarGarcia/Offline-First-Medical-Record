package br.univates.medicalfield.clinico;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

class PessoaTest extends TesteIntegracao {

    private static final Instant AS_10_00 = Instant.parse("2026-11-03T10:00:00Z");
    private static final Instant AS_10_30 = Instant.parse("2026-11-03T10:30:00Z");

    @Test
    void cadastraComOrigemDoAparelhoEGuardaQuemSincronizou() {
        String token = tokenOperacional();
        UUID criador = UUID.randomUUID();
        String id = UUID.randomUUID().toString();
        ObjectNode corpo = objeto().put("id", id).put("nome", "  Maria Oliveira  ").put("cpf", cpfAleatorio())
                .put("dataNascimento", "1990-04-12").put("sexo", "FEMININO").put("email", "maria@exemplo.com");
        corpo.putObject("contato").put("nome", "José Oliveira").put("parentesco", "Pai").put("email", "jose@exemplo.com");
        corpo.set("origem", origem(criador, AS_10_00, "OFFLINE", "Ambulância 01"));

        Resposta r = post("/api/pessoa", corpo, token);

        assertThat(r.status()).isEqualTo(201);
        assertThat(r.corpo().path("resultado").asString()).isEqualTo("CRIADO");
        assertThat(r.corpo().path("id").asString()).isEqualTo(id);
        JsonNode dados = r.corpo().path("dados");
        assertThat(dados.path("nome").asString()).isEqualTo("Maria Oliveira");
        assertThat(dados.path("contato").path("email").asString()).isEqualTo("jose@exemplo.com");
        assertThat(dados.path("origem").path("criadoPorId").asString()).isEqualTo(criador.toString());
        assertThat(dados.path("origem").path("modo").asString()).isEqualTo("OFFLINE");
        assertThat(dados.path("origem").path("dispositivoNome").asString()).isEqualTo("Ambulância 01");
        assertThat(Instant.parse(dados.path("origem").path("criadoEm").asString())).isEqualTo(AS_10_00);
        assertThat(dados.path("sincronizacao").path("sincronizadoPorId").asString())
                .isEqualTo(idDoToken(token).toString());
    }

    @Test
    void reenvioDoMesmoIdNaoDuplicaEOPrimeiroEnvioVale() {
        String token = tokenOperacional();
        String id = UUID.randomUUID().toString();
        String cpf = cpfAleatorio();
        assertThat(post("/api/pessoa", objeto().put("id", id).put("nome", "Primeiro").put("cpf", cpf), token).status())
                .isEqualTo(201);

        Resposta reenvio = post("/api/pessoa", objeto().put("id", id).put("nome", "Outro nome").put("cpf", cpf), token);

        assertThat(reenvio.status()).isEqualTo(200);
        assertThat(reenvio.corpo().path("resultado").asString()).isEqualTo("JA_EXISTIA");
        assertThat(reenvio.corpo().path("dados").path("nome").asString()).isEqualTo("Primeiro");
        assertThat(jdbc.sql("SELECT count(*) FROM clinico.pessoa WHERE cpf = :cpf").param("cpf", cpf)
                .query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    void semIdESemOrigemOServidorPreencheComOToken() {
        String token = tokenOperacional();
        Resposta r = post("/api/pessoa", objeto().put("nome", "Pelo Postman"), token);

        assertThat(r.status()).isEqualTo(201);
        assertThat(UUID.fromString(r.corpo().path("id").asString()).version()).isEqualTo(7);
        JsonNode origem = r.corpo().path("dados").path("origem");
        assertThat(origem.path("criadoPorId").asString()).isEqualTo(idDoToken(token).toString());
        assertThat(origem.path("criadoPorNome").asString()).isEqualTo("Profissional de Teste");
        assertThat(origem.path("criadoPorRegistro").asString()).isEqualTo("CRM TESTE-1");
        assertThat(origem.path("modo").asString()).isEqualTo("ONLINE");
    }

    @Test
    void semOrigemODispositivoVemDosCabecalhosComONomeDecodificado() {
        String token = tokenOperacional();
        String dispositivo = UUID.randomUUID().toString();
        Resposta r = post("/api/pessoa", objeto().put("nome", "Sem Origem no Corpo"), token,
                Map.of("X-Dispositivo-Id", dispositivo, "X-Dispositivo-Nome", "Ambul%C3%A2ncia%2001+A"));

        assertThat(r.status()).isEqualTo(201);
        JsonNode origem = r.corpo().path("dados").path("origem");
        assertThat(origem.path("dispositivoId").asString()).isEqualTo(dispositivo);
        assertThat(origem.path("dispositivoNome").asString()).isEqualTo("Ambulância 01+A");
    }

    @Test
    void validaOsCamposEExplicaCadaProblema() {
        ObjectNode corpo = objeto().put("nome", " ").put("cpf", "12345678900").put("sexo", "X")
                .put("email", "nao-e-email").put("dataNascimento", LocalDate.now().plusDays(3).toString());
        corpo.set("origem", origem(UUID.randomUUID(), Instant.now().plus(3, ChronoUnit.HOURS), "LIGADO", null));

        Resposta r = post("/api/pessoa", corpo, tokenOperacional());

        assertThat(r.status()).isEqualTo(400);
        assertThat(r.erro()).isEqualTo("VALIDACAO");
        assertThat(r.camposComErro()).contains("nome", "cpf", "sexo", "email", "dataNascimento", "origem.modo");
    }

    @Test
    void origemComDataNoFuturoForaDaFolgaEhRecusada() {
        ObjectNode corpo = objeto().put("nome", "Relógio adiantado");
        corpo.set("origem", origem(UUID.randomUUID(), Instant.now().plus(3, ChronoUnit.HOURS), "OFFLINE", null));
        Resposta r = post("/api/pessoa", corpo, tokenOperacional());
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.camposComErro()).containsExactly("origem.criadoEm");

        ObjectNode dentroDaFolga = objeto().put("nome", "Relógio um pouco adiantado");
        dentroDaFolga.set("origem", origem(UUID.randomUUID(), Instant.now().plus(20, ChronoUnit.MINUTES), "OFFLINE", null));
        assertThat(post("/api/pessoa", dentroDaFolga, tokenOperacional()).status()).isEqualTo(201);
    }

    @Test
    void jsonQuebradoOuIdNoFormatoErrado() {
        Resposta quebrado = post("/api/pessoa", "{\"nome\": ", tokenOperacional());
        assertThat(quebrado.status()).isEqualTo(400);
        assertThat(quebrado.erro()).isEqualTo("VALIDACAO");

        Resposta idRuim = post("/api/pessoa", objeto().put("id", "123").put("nome", "x"), tokenOperacional());
        assertThat(idRuim.status()).isEqualTo(400);
        assertThat(idRuim.camposComErro()).containsExactly("id");
    }

    @Test
    void cpfRepetidoEhUnificadoComAEstrategiaMaisRecenteVence() {
        String ambulancia1 = tokenOperacional();
        String ambulancia2 = tokenOperacional();
        String cpf = cpfAleatorio();
        String idA = UUID.randomUUID().toString();
        String idB = UUID.randomUUID().toString();

        ObjectNode a = objeto().put("id", idA).put("nome", "João da Silva").put("cpf", cpf).put("telefone", "51911110000");
        a.set("origem", origem(UUID.randomUUID(), AS_10_00, "OFFLINE", "Ambulância 01"));
        assertThat(post("/api/pessoa", a, ambulancia1).status()).isEqualTo(201);

        ObjectNode b = objeto().put("id", idB).put("nome", "João da Silva").put("cpf", cpf).put("telefone", "51922220000")
                .put("email", "joao@exemplo.com");
        b.set("origem", origem(UUID.randomUUID(), AS_10_30, "OFFLINE", "Ambulância 02"));
        Resposta r = post("/api/pessoa", b, ambulancia2);

        assertThat(r.status()).isEqualTo(200);
        assertThat(r.corpo().path("resultado").asString()).isEqualTo("UNIFICADO");
        assertThat(r.corpo().path("id").asString()).isEqualTo(idA);
        assertThat(r.corpo().path("idEnviado").asString()).isEqualTo(idB);
        assertThat(r.corpo().path("dados").path("telefone").asString()).isEqualTo("51922220000");
        assertThat(r.corpo().path("dados").path("email").asString()).isEqualTo("joao@exemplo.com");
        String conflitoId = r.corpo().path("conflitoId").asString();

        // O conflito fica registrado, com cada diferença
        JsonNode conflito = null;
        for (JsonNode c : get("/api/conflito", tokenAdmin()).corpo()) {
            if (c.path("id").asString().equals(conflitoId)) {
                conflito = c;
            }
        }
        assertThat(conflito).isNotNull();
        assertThat(conflito.path("motivo").asString()).isEqualTo("CPF_DUPLICADO");
        assertThat(conflito.path("estrategia").asString()).isEqualTo("MAIS_RECENTE_VENCE");
        assertThat(conflito.path("idMantido").asString()).isEqualTo(idA);
        assertThat(conflito.path("dispositivoNome").asString()).isEqualTo("Ambulância 02");
        assertThat(conflito.path("diferencas").toString())
                .contains("\"campo\":\"telefone\"", "\"tipo\":\"CONFLITO\"", "\"valorDescartado\":\"51911110000\"")
                .contains("\"campo\":\"email\"", "\"tipo\":\"COMPLEMENTO\"");

        // Reenviar o duplicado devolve a mesma unificação
        Resposta reenvio = post("/api/pessoa", b, ambulancia2);
        assertThat(reenvio.corpo().path("resultado").asString()).isEqualTo("UNIFICADO");
        assertThat(reenvio.corpo().path("conflitoId").asString()).isEqualTo(conflitoId);

        // Um duplicado mais antigo não sobrescreve o valor mais novo
        ObjectNode c = objeto().put("id", UUID.randomUUID().toString()).put("nome", "João da Silva").put("cpf", cpf)
                .put("telefone", "51933330000");
        c.set("origem", origem(UUID.randomUUID(), AS_10_00.minus(1, ChronoUnit.HOURS), "OFFLINE", "Ambulância 03"));
        Resposta antigo = post("/api/pessoa", c, ambulancia1);
        assertThat(antigo.corpo().path("resultado").asString()).isEqualTo("UNIFICADO");
        assertThat(antigo.corpo().path("dados").path("telefone").asString()).isEqualTo("51922220000");

        // Uma pessoa só
        assertThat(jdbc.sql("SELECT count(*) FROM clinico.pessoa WHERE cpf = :cpf").param("cpf", cpf)
                .query(Integer.class).single()).isEqualTo(1);
    }
}

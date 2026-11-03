package br.univates.medicalfield.clinico;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

class ProntuarioTest extends TesteIntegracao {

    @Test
    void cadastraEConsultaPeloIdDaPessoa() {
        String token = tokenOperacional();
        UUID pessoa = criarPessoa(token, cpfAleatorio());
        String id = UUID.randomUUID().toString();

        Resposta criado = post("/api/prontuario", objeto().put("id", id).put("pessoaId", pessoa.toString())
                .put("tipoSanguineo", "AB-").put("alergias", "Penicilina"), token);
        assertThat(criado.status()).isEqualTo(201);
        assertThat(criado.corpo().path("dados").path("pessoaId").asString()).isEqualTo(pessoa.toString());

        Resposta reenvio = post("/api/prontuario", objeto().put("id", id).put("pessoaId", pessoa.toString()), token);
        assertThat(reenvio.corpo().path("resultado").asString()).isEqualTo("JA_EXISTIA");

        Resposta consulta = get("/api/prontuario/" + pessoa, token);
        assertThat(consulta.status()).isEqualTo(200);
        assertThat(consulta.corpo().path("id").asString()).isEqualTo(id);
        assertThat(consulta.corpo().path("tipoSanguineo").asString()).isEqualTo("AB-");
        assertThat(consulta.corpo().path("pessoa").path("nome").asString()).isEqualTo("Paciente de Teste");

        boolean naLista = false;
        for (JsonNode p : get("/api/prontuario", token).corpo()) {
            if (p.path("id").asString().equals(id)) {
                naLista = p.path("pessoa").path("id").asString().equals(pessoa.toString());
            }
        }
        assertThat(naLista).isTrue();
    }

    @Test
    void pessoaInexistenteOuSemProntuario() {
        String token = tokenOperacional();
        Resposta semPessoa = post("/api/prontuario", objeto().put("pessoaId", UUID.randomUUID().toString()), token);
        assertThat(semPessoa.status()).isEqualTo(422);
        assertThat(semPessoa.erro()).isEqualTo("PESSOA_NAO_ENCONTRADA");

        assertThat(get("/api/prontuario/" + UUID.randomUUID(), token).status()).isEqualTo(404);
        UUID semProntuario = criarPessoa(token, cpfAleatorio());
        Resposta r = get("/api/prontuario/" + semProntuario, token);
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.corpo().path("mensagem").asString()).contains("não tem prontuário");

        assertThat(post("/api/prontuario", objeto().put("pessoaId", semProntuario.toString()).put("tipoSanguineo", "Z+"),
                token).camposComErro()).containsExactly("tipoSanguineo");
    }

    @Test
    void segundoProntuarioDaMesmaPessoaEhUnificado() {
        String token = tokenOperacional();
        UUID pessoa = criarPessoa(token, cpfAleatorio());
        ObjectNode primeiro = objeto().put("id", UUID.randomUUID().toString()).put("pessoaId", pessoa.toString())
                .put("tipoSanguineo", "DESCONHECIDO").put("alergias", "Dipirona");
        primeiro.set("origem", origem(UUID.randomUUID(), Instant.parse("2026-11-03T10:00:00Z"), "OFFLINE", "Ambulância 01"));
        String idMantido = post("/api/prontuario", primeiro, token).corpo().path("id").asString();

        String idDescartado = UUID.randomUUID().toString();
        ObjectNode segundo = objeto().put("id", idDescartado).put("pessoaId", pessoa.toString())
                .put("tipoSanguineo", "O+").put("alergias", "Penicilina");
        segundo.set("origem", origem(UUID.randomUUID(), Instant.parse("2026-11-03T10:30:00Z"), "OFFLINE", "Ambulância 02"));
        Resposta r = post("/api/prontuario", segundo, token);

        assertThat(r.corpo().path("resultado").asString()).isEqualTo("UNIFICADO");
        assertThat(r.corpo().path("id").asString()).isEqualTo(idMantido);
        assertThat(r.corpo().path("idEnviado").asString()).isEqualTo(idDescartado);
        assertThat(r.corpo().path("dados").path("tipoSanguineo").asString()).isEqualTo("O+");
        assertThat(r.corpo().path("dados").path("alergias").asString()).isEqualTo("Penicilina");
    }

    @Test
    void prontuarioEnviadoComOIdDeUmaPessoaDescartadaVaiParaAPessoaMantida() {
        String token = tokenOperacional();
        String cpf = cpfAleatorio();
        UUID mantida = criarPessoa(token, cpf);
        UUID descartada = UUID.randomUUID();
        Resposta unificacao = post("/api/pessoa", objeto().put("id", descartada.toString()).put("nome", "Paciente de Teste")
                .put("cpf", cpf), token);
        assertThat(unificacao.corpo().path("resultado").asString()).isEqualTo("UNIFICADO");

        Resposta r = post("/api/prontuario", objeto().put("pessoaId", descartada.toString()).put("alergias", "Látex"), token);

        assertThat(r.status()).isEqualTo(201);
        assertThat(r.corpo().path("dados").path("pessoaId").asString()).isEqualTo(mantida.toString());
        assertThat(get("/api/prontuario/" + descartada, token).corpo().path("pessoa").path("id").asString())
                .isEqualTo(mantida.toString());
    }
}

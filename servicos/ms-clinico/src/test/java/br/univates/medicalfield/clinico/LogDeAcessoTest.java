package br.univates.medicalfield.clinico;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Middleware de log de acesso. O ms-clinico só pode INSERIR na auditoria; para conferir o que foi
 * gravado, o teste lê com o usuário do ms-auth (dono do schema). Precisa de MS_AUTH_DB_SENHA.
 */
class LogDeAcessoTest extends TesteIntegracao {

    private record Linha(String servico, String ip, UUID profissional, String metodo, String rota, int status, int tempo) {
    }

    private List<Linha> logsDoAgente(String agente) throws Exception {
        assertThat(registradorDeAcessos.aguardarPendentes(Duration.ofSeconds(10))).isTrue();
        String url = "jdbc:postgresql://" + variavel("DB_HOST", "127.0.0.1") + ":" + variavel("DB_PORTA", "5433") + "/"
                + variavel("DB_NOME", "medicalfield");
        try (Connection conexao = DriverManager.getConnection(url, "ms_auth", System.getenv("MS_AUTH_DB_SENHA"));
             PreparedStatement consulta = conexao.prepareStatement("""
                     SELECT servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms
                       FROM auditoria.log_acesso WHERE user_agent = ? ORDER BY data_hora""")) {
            consulta.setString(1, agente);
            List<Linha> linhas = new ArrayList<>();
            try (ResultSet rs = consulta.executeQuery()) {
                while (rs.next()) {
                    linhas.add(new Linha(rs.getString(1), rs.getString(2), rs.getObject(3, UUID.class), rs.getString(4),
                            rs.getString(5), rs.getInt(6), rs.getInt(7)));
                }
            }
            return linhas;
        }
    }

    @Test
    void registraCadaRequisicaoComOsCamposDoEnunciado() throws Exception {
        assumeTrue(System.getenv("MS_AUTH_DB_SENHA") != null, "defina MS_AUTH_DB_SENHA para ler a auditoria");
        String agente = "teste-log/" + UUID.randomUUID();
        Map<String, String> cabecalhos = Map.of("User-Agent", agente, "X-Real-IP", "203.0.113.9",
                "X-Dispositivo-Id", UUID.randomUUID().toString());
        String token = tokenOperacional();

        get("/api/medicamento?algo=1", token, cabecalhos);
        get("/api/medicamento", null, cabecalhos);
        get("/api/conflito", token, cabecalhos);

        List<Linha> linhas = logsDoAgente(agente);
        assertThat(linhas).hasSize(3);
        assertThat(linhas.get(0)).isEqualTo(new Linha("ms-clinico", "203.0.113.9", idDoToken(token), "GET",
                "/api/medicamento", 200, linhas.get(0).tempo()));
        assertThat(linhas.get(1).profissional()).isNull();
        assertThat(linhas.get(1).status()).isEqualTo(401);
        assertThat(linhas.get(2).rota()).isEqualTo("/api/conflito");
        assertThat(linhas.get(2).status()).isEqualTo(403);
        assertThat(linhas.get(2).profissional()).isEqualTo(idDoToken(token));
        assertThat(linhas).allSatisfy(l -> assertThat(l.tempo()).isGreaterThanOrEqualTo(0));
    }
}

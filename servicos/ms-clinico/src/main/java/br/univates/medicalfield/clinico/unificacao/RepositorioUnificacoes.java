package br.univates.medicalfield.clinico.unificacao;

import br.univates.medicalfield.clinico.comum.Banco;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Tabelas clinico.unificacao (apelidos de ID) e clinico.conflito (registro de cada unificação). */
@Repository
public class RepositorioUnificacoes {

    public static final String PESSOA = "PESSOA";
    public static final String PRONTUARIO = "PRONTUARIO";

    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public RepositorioUnificacoes(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public record Apelido(UUID idDescartado, UUID idMantido, String entidade, UUID conflitoId) {
    }

    public Optional<Apelido> buscarApelido(UUID idDescartado, String entidade) {
        return jdbc.sql("""
                SELECT id_descartado, id_mantido, entidade, conflito_id FROM clinico.unificacao
                 WHERE id_descartado = :id AND entidade = :entidade
                """)
                .param("id", idDescartado)
                .param("entidade", entidade)
                .query((rs, n) -> new Apelido(Banco.uuid(rs, "id_descartado"), Banco.uuid(rs, "id_mantido"),
                        rs.getString("entidade"), Banco.uuid(rs, "conflito_id")))
                .optional();
    }

    /** Traduz um ID descartado numa unificação para o ID mantido (ou devolve o próprio ID). */
    public UUID resolver(UUID id, String entidade) {
        return buscarApelido(id, entidade).map(Apelido::idMantido).orElse(id);
    }

    public UUID registrarConflito(NovoConflito c) {
        return jdbc.sql("""
                INSERT INTO clinico.conflito
                  (entidade, motivo, id_mantido, id_descartado, estrategia, diferencas, dados_recebidos,
                   sincronizado_por_id, dispositivo_id, dispositivo_nome)
                VALUES (:entidade, :motivo, :mantido, :descartado, :estrategia, CAST(:diferencas AS jsonb),
                        CAST(:dados AS jsonb), :sincronizadoPor, :dispositivo, :nomeDispositivo)
                RETURNING id
                """)
                .param("entidade", c.entidade())
                .param("motivo", c.motivo())
                .param("mantido", c.idMantido())
                .param("descartado", c.idDescartado())
                .param("estrategia", c.estrategia())
                .param("diferencas", json.writeValueAsString(c.diferencas()))
                .param("dados", json.writeValueAsString(c.dadosRecebidos()))
                .param("sincronizadoPor", c.sincronizadoPorId())
                .param("dispositivo", c.dispositivoId())
                .param("nomeDispositivo", c.dispositivoNome())
                .query(UUID.class)
                .single();
    }

    public void registrarApelido(UUID idDescartado, UUID idMantido, String entidade, UUID conflitoId) {
        jdbc.sql("""
                INSERT INTO clinico.unificacao (id_descartado, id_mantido, entidade, conflito_id)
                VALUES (:descartado, :mantido, :entidade, :conflito)
                """)
                .param("descartado", idDescartado)
                .param("mantido", idMantido)
                .param("entidade", entidade)
                .param("conflito", conflitoId)
                .update();
    }

    public List<Conflito> listarConflitos() {
        return jdbc.sql("SELECT * FROM clinico.conflito ORDER BY detectado_em DESC, id DESC")
                .query(this::conflito)
                .list();
    }

    public List<Unificacao> alteradasDesde(Instant limite) {
        return jdbc.sql("""
                SELECT entidade, id_descartado, id_mantido FROM clinico.unificacao
                 WHERE criado_em > :limite ORDER BY criado_em
                """)
                .param("limite", Banco.utc(limite))
                .query((rs, n) -> new Unificacao(rs.getString("entidade"), Banco.uuid(rs, "id_descartado"),
                        Banco.uuid(rs, "id_mantido")))
                .list();
    }

    private Conflito conflito(ResultSet rs, int linha) throws SQLException {
        return new Conflito(
                Banco.uuid(rs, "id"),
                rs.getString("entidade"),
                rs.getString("motivo"),
                Banco.uuid(rs, "id_mantido"),
                Banco.uuid(rs, "id_descartado"),
                rs.getString("estrategia"),
                json.readTree(rs.getString("diferencas")),
                Banco.instante(rs, "detectado_em"),
                Banco.uuid(rs, "sincronizado_por_id"),
                Banco.uuid(rs, "dispositivo_id"),
                rs.getString("dispositivo_nome"));
    }

    public record NovoConflito(
            String entidade,
            String motivo,
            UUID idMantido,
            UUID idDescartado,
            String estrategia,
            List<Diferenca> diferencas,
            Object dadosRecebidos,
            UUID sincronizadoPorId,
            UUID dispositivoId,
            String dispositivoNome) {
    }

    /** Uma unificação, como aparece em GET /api/conflito. */
    public record Conflito(
            UUID id,
            String entidade,
            String motivo,
            UUID idMantido,
            UUID idDescartado,
            String estrategia,
            JsonNode diferencas,
            Instant detectadoEm,
            UUID sincronizadoPorId,
            UUID dispositivoId,
            String dispositivoNome) {
    }

    /** Apelido de ID, como vai no "receber dados". */
    public record Unificacao(String entidade, UUID idDescartado, UUID idMantido) {
    }
}

package br.univates.medicalfield.clinico.medicamento;

import br.univates.medicalfield.clinico.comum.Banco;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class RepositorioMedicamentos {

    private static final String COLUNAS = "id, nome, apresentacao, unidade_padrao, ativo, atualizado_em";

    private final JdbcClient jdbc;

    public RepositorioMedicamentos(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Todos, inclusive os inativos (atendimentos antigos podem usá-los). */
    public List<Medicamento> listar() {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.medicamento ORDER BY nome, apresentacao NULLS FIRST")
                .query(this::mapear)
                .list();
    }

    public List<Medicamento> alteradosDesde(Instant limite) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.medicamento WHERE atualizado_em > :limite ORDER BY atualizado_em")
                .param("limite", Banco.utc(limite))
                .query(this::mapear)
                .list();
    }

    /** Quais destes IDs existem no catálogo. */
    public Set<UUID> existentes(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("SELECT id FROM clinico.medicamento WHERE id IN (:ids)")
                .param("ids", ids)
                .query(UUID.class)
                .list());
    }

    private Medicamento mapear(ResultSet rs, int linha) throws SQLException {
        return new Medicamento(
                Banco.uuid(rs, "id"),
                rs.getString("nome"),
                rs.getString("apresentacao"),
                rs.getString("unidade_padrao"),
                rs.getBoolean("ativo"),
                Banco.instante(rs, "atualizado_em"));
    }
}

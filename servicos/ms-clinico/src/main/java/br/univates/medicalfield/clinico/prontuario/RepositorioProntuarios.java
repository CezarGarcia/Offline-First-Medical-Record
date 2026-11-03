package br.univates.medicalfield.clinico.prontuario;

import br.univates.medicalfield.clinico.comum.Banco;
import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.pessoa.Pessoa;
import br.univates.medicalfield.clinico.unificacao.Carimbos;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Padrão Repository: todo o SQL de clinico.prontuario fica aqui. */
@Repository
public class RepositorioProntuarios {

    /** Campos que podem ser mesclados numa unificação: coluna → nome na API. */
    public static final Map<String, String> CAMPOS_MESCLAVEIS = campos();

    private static final String COLUNAS = """
            id, pessoa_id, tipo_sanguineo, alergias, comorbidades, medicamentos_uso_continuo, observacoes, carimbos,
            criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id, dispositivo_nome,
            modo_registro, sincronizado_por_id, recebido_em, atualizado_em""";

    private final JdbcClient jdbc;
    private final Carimbos carimbos;

    public RepositorioProntuarios(JdbcClient jdbc, Carimbos carimbos) {
        this.jdbc = jdbc;
        this.carimbos = carimbos;
    }

    public record NovoProntuario(UUID id, UUID pessoaId, Map<String, String> valores, Origem origem, UUID sincronizadoPorId) {
    }

    public record ParaMesclar(UUID id, Map<String, String> valores, Map<String, Instant> carimbos, Instant criadoEm) {
    }

    /** Insere se nem o ID nem a pessoa já tiverem prontuário. Devolve 1 se inseriu, 0 se não. */
    public int inserir(NovoProntuario p) {
        Map<String, String> v = p.valores();
        Origem o = p.origem();
        return jdbc.sql("""
                INSERT INTO clinico.prontuario
                  (id, pessoa_id, tipo_sanguineo, alergias, comorbidades, medicamentos_uso_continuo, observacoes,
                   carimbos, criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id,
                   dispositivo_nome, modo_registro, sincronizado_por_id)
                VALUES
                  (:id, :pessoaId, :tipoSanguineo, :alergias, :comorbidades, :usoContinuo, :observacoes,
                   CAST(:carimbos AS jsonb), :criadoPorId, :criadoPorNome, :criadoPorRegistro, :criadoEm, :dispositivoId,
                   :dispositivoNome, :modo, :sincronizadoPorId)
                ON CONFLICT DO NOTHING
                """)
                .param("id", p.id())
                .param("pessoaId", p.pessoaId())
                .param("tipoSanguineo", v.get("tipo_sanguineo"))
                .param("alergias", v.get("alergias"))
                .param("comorbidades", v.get("comorbidades"))
                .param("usoContinuo", v.get("medicamentos_uso_continuo"))
                .param("observacoes", v.get("observacoes"))
                .param("carimbos", carimbos.iniciais(CAMPOS_MESCLAVEIS.keySet(), o.criadoEm()))
                .param("criadoPorId", o.criadoPorId())
                .param("criadoPorNome", o.criadoPorNome())
                .param("criadoPorRegistro", o.criadoPorRegistro())
                .param("criadoEm", Banco.utc(o.criadoEm()))
                .param("dispositivoId", o.dispositivoId())
                .param("dispositivoNome", o.dispositivoNome())
                .param("modo", o.modo())
                .param("sincronizadoPorId", p.sincronizadoPorId())
                .update();
    }

    public Optional<Prontuario> buscar(UUID id) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.prontuario WHERE id = :id")
                .param("id", id)
                .query(RepositorioProntuarios::mapear)
                .optional();
    }

    public Optional<Prontuario> buscarPorPessoa(UUID pessoaId) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.prontuario WHERE pessoa_id = :pessoaId")
                .param("pessoaId", pessoaId)
                .query(RepositorioProntuarios::mapear)
                .optional();
    }

    public boolean existe(UUID id) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM clinico.prontuario WHERE id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
    }

    /** Prontuário da pessoa, travado até o fim da transação (SELECT ... FOR UPDATE). */
    public Optional<ParaMesclar> travarPorPessoa(UUID pessoaId) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.prontuario WHERE pessoa_id = :pessoaId FOR UPDATE")
                .param("pessoaId", pessoaId)
                .query((rs, n) -> new ParaMesclar(Banco.uuid(rs, "id"), valores(rs), carimbos.ler(rs.getString("carimbos")),
                        Banco.instante(rs, "criado_em")))
                .optional();
    }

    public void aplicarMesclagem(UUID id, Map<String, String> v, Map<String, Instant> novosCarimbos) {
        jdbc.sql("""
                UPDATE clinico.prontuario
                   SET tipo_sanguineo = :tipoSanguineo, alergias = :alergias, comorbidades = :comorbidades,
                       medicamentos_uso_continuo = :usoContinuo, observacoes = :observacoes,
                       carimbos = CAST(:carimbos AS jsonb), atualizado_em = now()
                 WHERE id = :id
                """)
                .param("id", id)
                .param("tipoSanguineo", v.get("tipo_sanguineo"))
                .param("alergias", v.get("alergias"))
                .param("comorbidades", v.get("comorbidades"))
                .param("usoContinuo", v.get("medicamentos_uso_continuo"))
                .param("observacoes", v.get("observacoes"))
                .param("carimbos", carimbos.escrever(novosCarimbos))
                .update();
    }

    /** Todos os prontuários, cada um com o resumo da pessoa. */
    public List<Prontuario> listarComPessoa() {
        return jdbc.sql("""
                SELECT pr.*, pe.nome AS pessoa_nome, pe.cpf AS pessoa_cpf
                  FROM clinico.prontuario pr
                  JOIN clinico.pessoa pe ON pe.id = pr.pessoa_id
                 ORDER BY pe.nome, pr.id
                """)
                .query((rs, n) -> mapear(rs, n).comPessoa(
                        new Pessoa.Resumo(Banco.uuid(rs, "pessoa_id"), rs.getString("pessoa_nome"), rs.getString("pessoa_cpf"))))
                .list();
    }

    public List<Prontuario> alteradosDesde(Instant limite) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.prontuario WHERE atualizado_em > :limite ORDER BY atualizado_em")
                .param("limite", Banco.utc(limite))
                .query(RepositorioProntuarios::mapear)
                .list();
    }

    static Prontuario mapear(ResultSet rs, int linha) throws SQLException {
        return new Prontuario(
                Banco.uuid(rs, "id"),
                Banco.uuid(rs, "pessoa_id"),
                rs.getString("tipo_sanguineo"),
                rs.getString("alergias"),
                rs.getString("comorbidades"),
                rs.getString("medicamentos_uso_continuo"),
                rs.getString("observacoes"),
                Banco.origem(rs),
                Banco.sincronizacao(rs),
                null);
    }

    private static Map<String, String> valores(ResultSet rs) throws SQLException {
        Map<String, String> valores = new LinkedHashMap<>();
        for (String coluna : CAMPOS_MESCLAVEIS.keySet()) {
            valores.put(coluna, rs.getString(coluna));
        }
        return valores;
    }

    private static Map<String, String> campos() {
        Map<String, String> campos = new LinkedHashMap<>();
        campos.put("tipo_sanguineo", "tipoSanguineo");
        campos.put("alergias", "alergias");
        campos.put("comorbidades", "comorbidades");
        campos.put("medicamentos_uso_continuo", "medicamentosUsoContinuo");
        campos.put("observacoes", "observacoes");
        return Collections.unmodifiableMap(campos);
    }
}

package br.univates.medicalfield.clinico.pessoa;

import br.univates.medicalfield.clinico.comum.Banco;
import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.unificacao.Carimbos;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Padrão Repository: todo o SQL de clinico.pessoa fica aqui. */
@Repository
public class RepositorioPessoas {

    /** Campos que podem ser mesclados numa unificação: coluna → nome na API. */
    public static final Map<String, String> CAMPOS_MESCLAVEIS = campos();

    private static final String COLUNAS = """
            id, nome, cpf, data_nascimento, sexo, telefone, email,
            contato_nome, contato_parentesco, contato_telefone, contato_email, carimbos,
            criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id, dispositivo_nome,
            modo_registro, sincronizado_por_id, recebido_em, atualizado_em""";

    private final JdbcClient jdbc;
    private final Carimbos carimbos;

    public RepositorioPessoas(JdbcClient jdbc, Carimbos carimbos) {
        this.jdbc = jdbc;
        this.carimbos = carimbos;
    }

    public record NovaPessoa(UUID id, Map<String, String> valores, String cpf, Origem origem, UUID sincronizadoPorId) {
    }

    /** Registro existente, travado para a mesclagem. */
    public record ParaMesclar(UUID id, Map<String, String> valores, Map<String, Instant> carimbos, Instant criadoEm) {
    }

    /** Insere se nem o ID nem o CPF existirem. Devolve 1 se inseriu, 0 se não. */
    public int inserir(NovaPessoa p) {
        Map<String, String> v = p.valores();
        Origem o = p.origem();
        return jdbc.sql("""
                INSERT INTO clinico.pessoa
                  (id, nome, cpf, data_nascimento, sexo, telefone, email,
                   contato_nome, contato_parentesco, contato_telefone, contato_email, carimbos,
                   criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id, dispositivo_nome,
                   modo_registro, sincronizado_por_id)
                VALUES
                  (:id, :nome, :cpf, :dataNascimento, :sexo, :telefone, :email,
                   :contatoNome, :contatoParentesco, :contatoTelefone, :contatoEmail, CAST(:carimbos AS jsonb),
                   :criadoPorId, :criadoPorNome, :criadoPorRegistro, :criadoEm, :dispositivoId, :dispositivoNome,
                   :modo, :sincronizadoPorId)
                ON CONFLICT DO NOTHING
                """)
                .param("id", p.id())
                .param("nome", v.get("nome"))
                .param("cpf", p.cpf())
                .param("dataNascimento", data(v.get("data_nascimento")))
                .param("sexo", v.get("sexo"))
                .param("telefone", v.get("telefone"))
                .param("email", v.get("email"))
                .param("contatoNome", v.get("contato_nome"))
                .param("contatoParentesco", v.get("contato_parentesco"))
                .param("contatoTelefone", v.get("contato_telefone"))
                .param("contatoEmail", v.get("contato_email"))
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

    public Optional<Pessoa> buscar(UUID id) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.pessoa WHERE id = :id")
                .param("id", id)
                .query(RepositorioPessoas::mapear)
                .optional();
    }

    public boolean existe(UUID id) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM clinico.pessoa WHERE id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
    }

    /** Busca a pessoa do CPF e trava a linha até o fim da transação (SELECT ... FOR UPDATE). */
    public Optional<ParaMesclar> travarPorCpf(String cpf) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.pessoa WHERE cpf = :cpf FOR UPDATE")
                .param("cpf", cpf)
                .query((rs, n) -> new ParaMesclar(Banco.uuid(rs, "id"), valores(rs), carimbos.ler(rs.getString("carimbos")),
                        Banco.instante(rs, "criado_em")))
                .optional();
    }

    public void aplicarMesclagem(UUID id, Map<String, String> v, Map<String, Instant> novosCarimbos) {
        jdbc.sql("""
                UPDATE clinico.pessoa
                   SET nome = :nome, data_nascimento = :dataNascimento, sexo = :sexo, telefone = :telefone,
                       email = :email, contato_nome = :contatoNome, contato_parentesco = :contatoParentesco,
                       contato_telefone = :contatoTelefone, contato_email = :contatoEmail,
                       carimbos = CAST(:carimbos AS jsonb), atualizado_em = now()
                 WHERE id = :id
                """)
                .param("id", id)
                .param("nome", v.get("nome"))
                .param("dataNascimento", data(v.get("data_nascimento")))
                .param("sexo", v.get("sexo"))
                .param("telefone", v.get("telefone"))
                .param("email", v.get("email"))
                .param("contatoNome", v.get("contato_nome"))
                .param("contatoParentesco", v.get("contato_parentesco"))
                .param("contatoTelefone", v.get("contato_telefone"))
                .param("contatoEmail", v.get("contato_email"))
                .param("carimbos", carimbos.escrever(novosCarimbos))
                .update();
    }

    public List<Pessoa> listar() {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.pessoa ORDER BY nome, id")
                .query(RepositorioPessoas::mapear)
                .list();
    }

    public List<Pessoa> alteradasDesde(Instant limite) {
        return jdbc.sql("SELECT " + COLUNAS + " FROM clinico.pessoa WHERE atualizado_em > :limite ORDER BY atualizado_em")
                .param("limite", Banco.utc(limite))
                .query(RepositorioPessoas::mapear)
                .list();
    }

    static Pessoa mapear(ResultSet rs, int linha) throws SQLException {
        return new Pessoa(
                Banco.uuid(rs, "id"),
                rs.getString("nome"),
                rs.getString("cpf"),
                Banco.data(rs, "data_nascimento"),
                rs.getString("sexo"),
                rs.getString("telefone"),
                rs.getString("email"),
                new Pessoa.Contato(rs.getString("contato_nome"), rs.getString("contato_parentesco"),
                        rs.getString("contato_telefone"), rs.getString("contato_email")),
                Banco.origem(rs),
                Banco.sincronizacao(rs));
    }

    private static Map<String, String> valores(ResultSet rs) throws SQLException {
        Map<String, String> valores = new LinkedHashMap<>();
        for (String coluna : CAMPOS_MESCLAVEIS.keySet()) {
            valores.put(coluna, rs.getString(coluna));
        }
        return valores;
    }

    private static LocalDate data(String texto) {
        return texto == null ? null : LocalDate.parse(texto);
    }

    private static Map<String, String> campos() {
        Map<String, String> campos = new LinkedHashMap<>();
        campos.put("nome", "nome");
        campos.put("data_nascimento", "dataNascimento");
        campos.put("sexo", "sexo");
        campos.put("telefone", "telefone");
        campos.put("email", "email");
        campos.put("contato_nome", "contato.nome");
        campos.put("contato_parentesco", "contato.parentesco");
        campos.put("contato_telefone", "contato.telefone");
        campos.put("contato_email", "contato.email");
        // LinkedHashMap mantém a ordem dos campos no registro do conflito
        return Collections.unmodifiableMap(campos);
    }
}

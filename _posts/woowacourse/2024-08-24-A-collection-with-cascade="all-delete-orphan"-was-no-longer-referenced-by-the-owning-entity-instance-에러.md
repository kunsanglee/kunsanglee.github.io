---
title: "org.hibernate.HibernateException: A collection with cascade=\"all-delete-orphan\" was no longer referenced by the owning entity instance 에러 트러블 슈팅"
categories:
  - woowacourse
tags:
  - project
  - JPA
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---
**org.hibernate.HibernateException: A collection with cascade="all-delete-orphan" was no longer referenced by the owning entity instance** 에러 트러블 슈팅한 내용이다.


지출 내역의 이름과 금액을 `BillAction`이라는 엔티티로 관리하고 있다.
예를 들어 민수, 철수, 영희 3명이 스타벅스에서 각각 아메리카노 1잔씩 마셨다고 가정하면, 
`BillAction`의 title에는 스타벅스, price는 15,000원을 저장한다.
그리고 하나의 지출 내역 `BillAction`은 해당 지출이 발생할 때 같이 있었던 인원들에 대한 여러 `BillActionDetail`정보와 1:N, N:1 양방향 연관 관계로 설정되어있다.
위의 예시로 보면 `List<BillActionDetail> billActionDetails`에는 스타벅스에서 15,000원 지출한 지출내역 `BillAction`을 공통으로 갖고, 민수, 철수, 영희 각 5,000원이 저장되어 있을 것이다.
```java
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
public class BillAction implements Comparable<BillAction> {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    private Action action;

    @Column(length = MAX_TITLE_LENGTH)
    private String title;

    private Long price;

    @OneToMany(mappedBy = "billAction", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<BillActionDetail> billActionDetails = new ArrayList<>();
    
    // ...
    
}

@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
public class BillActionDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    private BillAction billAction;

    private String memberName;

    private Long price;

    private boolean isFixed;
    
    // ...
    
}
```
`BillAction`에는 행사에 참여중인 참여자가 행사에 포함된 인원에서 삭제되는 상황에, 해당 지출 내역에 포함된 지출 상세 `BillActionDetail`을 초기화하는 `resetBillActionDetails` 메서드가 있다. 해당 메서드는 지출 금액을 인원수로 나눈 1/N 금액을 지출 상세로 돌려놓는 메서드이다. 이전에 지출 상세를 사용자가 차등 정산 기능을 사용해 임의로 지출 상세를 수정한 상황, 예를 들어 스타벅스에서 5,000원 3명이 아니라, 6,000원 2명, 3,000원 1명으로 수정한 상황에 다시 1/N 가격으로 지출 상세를 수정한다는 말이다.

```java
// BillAction method

public void resetBillActionDetails(CurrentMembers currentMembers) {
        Iterator<Long> priceIterator = distributePrice(currentMembers.size()).iterator();

        this.billActionDetails = currentMembers.getMembers().stream()
                .map(memberName -> new BillActionDetail(this, memberName, priceIterator.next(), false))
                .toList();
    }

    private List<Long> distributePrice(int memberCount) {
        if (memberCount == 0) {
            return new ArrayList<>();
        }
        long eachPrice = price / memberCount;
        long remainder = price % memberCount;

        List<Long> results = Stream.generate(() -> eachPrice)
                .limit(memberCount - 1)
                .collect(Collectors.toList());
        results.add(eachPrice + remainder);
        return results;
    }
```

그런데 `resetBillActionDetails` 메서드에는 문제가 있다. BillAction의 billActionDetails는 생성시 빈 리스트로 초기화되어 있는데,
`CascadeType.ALL, orphanRemoval=true` 옵션이 적용되어있다. `CascadeType.ALL` 옵션으로 인해 billActionDetails에 포함된 여러개의 BillActionDetail 엔티티들은 BillAction 엔티티와 생명주기가 함께 유지된다. BillAction에 종속적인 BillActionDetail이 생성되어 저장되면, BillAction 또한 같이 저장된다. 삭제될 때도 마찬가지로 BillAction에 종속되어 있기 때문에, BillAction이 삭제되면 BillActionDetail 또한 삭제된다. 또 `orphanRemoval=true` 설정은 부모 엔티티 BillAction와 자식 엔티티 BillActionDetail 관계가 끊어지면 자동으로 삭제되도록 하는 옵션이다. 만약 many 쪽의 리스트를 새로 할당하게 되면, 이전에 참조하던 자식 엔티티 BillActionDetail은 부모 엔티티와 관계가 끊어지므로, JPA는 이들을 고아로 간주한다.

```java
@OneToMany(mappedBy = "billAction", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<BillActionDetail> billActionDetails = new ArrayList<>();
```

그래서 다시 위에 있는 메서드 resetBillActionDetails를 보면, 현재 존재하는 인원을 나타내는 CurrentMembers에 존재하는 참여자 수 만큼 가격을 1/N으로 나눠서 각 참여인원마다 새로운 지출 상세로 생성하고 새로운 리스트를 생성해서 BillAction의 billActionDetails로 할당하고 있다. 문제는 이미 BillAction을 생성할 때 billActionDetails가 리스트로 초기화되어서 저장된 상황에 새로운 리스트를 할당하면, 기존에 존재하는 List<BillActionDetail>에 포함되어 있던 BillActionDetail들이 BillAction과 참조가 끊어져있지 않은 상황에서 새로운 리스트로 교체하는 과정에서 JPA는 이전 리스트에 있는 자식 엔티티들이 여전히 부모 엔티티에 의해 관리되고 있다고 가정한다. 그러나 실제로는 새로운 리스트가 할당되면서 이들 자식 엔티티에 대한 참조가 끊어지므로, 참조 무결성 문제가 발생하고 JPA는 이를 인식하여 에러를 발생시킨다.

이 문제를 해결하기 위해서는 다음과 같은 방법을 고려할 수 있다.
1. 새로운 리스트를 할당하기 전에, **기존 리스트의 모든 요소를 명시적으로 제거한 후 새로운 리스트를 추가**한다. 예를 들어, `billActionDetails.clear();`를 호출한 후 새로운 리스트를 추가한다.
2. 새로운 리스트를 할당하는 대신, 기존 리스트에 새로운 요소를 추가하는 방식으로 변경. 이 경우 JPA는 **기존의 참조를 유지**하므로 에러가 발생하지 않는다.
3. **모든 작업이 같은 트랜잭션 내에서 이루어지도록 보장**하여, JPA의 상태 관리가 올바르게 이루어지도록 한다.

이와 같은 방법으로 `A collection with cascade="all-delete-orphan" was no longer referenced by the owning entity instance` 에러를 방지할 수 있다.
